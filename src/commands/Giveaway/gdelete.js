import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { LughxBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { getGuildGiveaways, deleteGiveaway } from '../../utils/giveaways.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("gdelete")
        .setDescription(
            "Xóa tin nhắn giveaway và loại bỏ nó khỏi cơ sở dữ liệu.",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("ID tin nhắn của giveaway cần xóa.")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            
            if (!interaction.inGuild()) {
                throw new LughxBotError(
                    'Giveaway command used outside guild',
                    ErrorTypes.VALIDATION,
                    'Lệnh này chỉ có thể được sử dụng trong máy chủ.',
                    { userId: interaction.user.id }
                );
            }
            
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                throw new LughxBotError(
                    'User lacks ManageGuild permission',
                    ErrorTypes.PERMISSION,
                    "Bạn cần quyền 'Quản lý máy chủ' để xóa giveaway.",
                    { userId: interaction.user.id, guildId: interaction.guildId }
                );
            }

            logger.info(`Giveaway deletion started by ${interaction.user.tag} in guild ${interaction.guildId}`);

            const messageId = interaction.options.getString("messageid");
            
            if (!messageId || !/^\d+$/.test(messageId)) {
                throw new LughxBotError(
                    'Invalid message ID format',
                    ErrorTypes.VALIDATION,
                    'Vui lòng cung cấp ID tin nhắn hợp lệ.',
                    { providedId: messageId }
                );
            }

            const giveaways = await getGuildGiveaways(interaction.client, interaction.guildId);
            const giveaway = giveaways.find(g => g.messageId === messageId);

            if (!giveaway) {
                throw new LughxBotError(
                    `Giveaway not found: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    "Không tìm thấy giveaway nào với ID tin nhắn đó.",
                    { messageId, guildId: interaction.guildId }
                );
            }

            let deletedMessage = false;
            let channelName = "Kênh không xác định";

            const tryDeleteFromChannel = async (channel) => {
                if (!channel || !channel.isTextBased() || !channel.messages?.fetch) {
                    return false;
                }

                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (!message) {
                    return false;
                }

                await message.delete();
                channelName = channel.name || 'kênh-không-xác-định';
                deletedMessage = true;
                return true;
            };
            
            try {
                const channel = await interaction.client.channels.fetch(giveaway.channelId).catch(() => null);
                if (await tryDeleteFromChannel(channel)) {
                    logger.debug(`Deleted giveaway message ${messageId} from channel ${channelName}`);
                }

                if (!deletedMessage && interaction.guild) {
                    const textChannels = interaction.guild.channels.cache.filter(
                        ch => ch.id !== giveaway.channelId && ch.isTextBased() && ch.messages?.fetch
                    );

                    for (const [, guildChannel] of textChannels) {
                        const foundAndDeleted = await tryDeleteFromChannel(guildChannel).catch(() => false);
                        if (foundAndDeleted) {
                            logger.debug(`Deleted giveaway message ${messageId} via fallback lookup in #${channelName}`);
                            break;
                        }
                    }
                }
            } catch (error) {
                logger.warn(`Could not delete giveaway message: ${error.message}`);
            }
            
            const removedFromDatabase = await deleteGiveaway(
                interaction.client,
                interaction.guildId,
                messageId,
            );

            if (!removedFromDatabase) {
                throw new LughxBotError(
                    `Failed to delete giveaway from database: ${messageId}`,
                    ErrorTypes.UNKNOWN,
                    'Không thể xóa giveaway khỏi cơ sở dữ liệu. Vui lòng thử lại.',
                    { messageId, guildId: interaction.guildId }
                );
            }

            const giveawaysAfterDelete = await getGuildGiveaways(interaction.client, interaction.guildId);
            const stillExistsInDatabase = giveawaysAfterDelete.some(g => g.messageId === messageId);

            if (stillExistsInDatabase) {
                throw new LughxBotError(
                    `Giveaway still exists after deletion: ${messageId}`,
                    ErrorTypes.UNKNOWN,
                    'Việc xóa không được lưu vào cơ sở dữ liệu. Vui lòng thử lại.',
                    { messageId, guildId: interaction.guildId }
                );
            }

            const statusMsg = deletedMessage
                ? `và tin nhắn đã bị xóa khỏi #${channelName}`
                : `nhưng tin nhắn đã bị xóa hoặc không thể truy cập kênh.`;

            const winnerIds = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
            const hasWinners = winnerIds.length > 0;
            const wasEnded = giveaway.ended === true || giveaway.isEnded === true || hasWinners;

            const winnerStatusMsg = hasWinners
                ? `Giveaway này đã chọn được ${winnerIds.length} người chiến thắng.`
                : wasEnded
                    ? 'Giveaway này đã kết thúc mà không có người chiến thắng hợp lệ.'
                    : 'Chưa có người chiến thắng nào được chọn trước khi xóa.';

            logger.info(`Giveaway deleted: ${messageId} in ${channelName}`);
            
            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_DELETE,
                    data: {
                        description: `Giveaway đã xóa: ${giveaway.prize}`,
                        channelId: giveaway.channelId,
                        userId: interaction.user.id,
                        fields: [
                            { name: '🎁 Phần thưởng', value: giveaway.prize || 'Không xác định', inline: true },
                            { name: '📊 Lượt tham gia', value: (giveaway.participants?.length || 0).toString(), inline: true }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Error logging giveaway deletion:', logError);
            }

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        "Đã xóa Giveaway",
                        `Đã xóa thành công giveaway cho **${giveaway.prize}** ${statusMsg}. ${winnerStatusMsg}`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            logger.error('Error in gdelete command:', error);
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'gdelete',
                context: 'giveaway_deletion'
            });
        }
    },
};