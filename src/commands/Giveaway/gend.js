import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { LughxBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { getGuildGiveaways, saveGiveaway } from '../../utils/giveaways.js';
import { 
    endGiveaway as endGiveawayService,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gend")
        .setDescription(
            "Kết thúc giveaway đang diễn ra ngay lập tức và chọn người chiến thắng.",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("ID tin nhắn của giveaway cần kết thúc.")
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
                    "Bạn cần quyền 'Quản lý máy chủ' để kết thúc giveaway.",
                    { userId: interaction.user.id, guildId: interaction.guildId }
                );
            }

            logger.info(`Giveaway end initiated by ${interaction.user.tag} in guild ${interaction.guildId}`);

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
                    "Không tìm thấy giveaway nào với ID tin nhắn đó trong cơ sở dữ liệu.",
                    { messageId, guildId: interaction.guildId }
                );
            }
            
            const endResult = await endGiveawayService(
                interaction.client,
                giveaway,
                interaction.guildId,
                interaction.user.id
            );

            const updatedGiveaway = endResult.giveaway;
            const winners = endResult.winners;
            
            const channel = await interaction.client.channels.fetch(
                updatedGiveaway.channelId,
            ).catch(err => {
                logger.warn(`Could not fetch channel ${updatedGiveaway.channelId}:`, err.message);
                return null;
            });

            if (!channel || !channel.isTextBased()) {
                throw new LughxBotError(
                    `Channel not found: ${updatedGiveaway.channelId}`,
                    ErrorTypes.VALIDATION,
                    "Không thể tìm thấy kênh tổ chức giveaway. Trạng thái giveaway đã được cập nhật.",
                    { channelId: updatedGiveaway.channelId, messageId }
                );
            }

            const message = await channel.messages
                .fetch(messageId)
                .catch(err => {
                    logger.warn(`Could not fetch message ${messageId}:`, err.message);
                    return null;
                });

            if (!message) {
                throw new LughxBotError(
                    `Message not found: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    "Không thể tìm thấy tin nhắn giveaway. Trạng thái giveaway đã được cập nhật.",
                    { messageId, channelId: updatedGiveaway.channelId }
                );
            }
            
            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                updatedGiveaway,
            );
            
            const newEmbed = createGiveawayEmbed(updatedGiveaway, "ended", winners);
            const newRow = createGiveawayButtons(true);

            await message.edit({
                content: "🎉 **GIVEAWAY ĐÃ KẾT THÚC** 🎉",
                embeds: [newEmbed],
                components: [newRow],
            });
            
            if (winners.length > 0) {
                const winnerMentions = winners
                    .map((id) => `<@${id}>`)
                    .join(", ");
                const winnerPingMsg = await channel.send({
                    content: `🎉 CHÚC MỪNG ${winnerMentions}! Bạn đã thắng phần thưởng **${updatedGiveaway.prize}**! Vui lòng liên hệ host <@${updatedGiveaway.hostId}> để nhận thưởng.`,
                });
                updatedGiveaway.winnerPingMessageId = winnerPingMsg.id;
                await saveGiveaway(interaction.client, interaction.guildId, updatedGiveaway);

                logger.info(`Giveaway ended with ${winners.length} winner(s): ${messageId}`);
                
                try {
                    await logEvent({
                        client: interaction.client,
                        guildId: interaction.guildId,
                        eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                        data: {
                            description: `Giveaway kết thúc với ${winners.length} người thắng`,
                            channelId: channel.id,
                            userId: interaction.user.id,
                            fields: [
                                { name: '🎁 Phần thưởng', value: updatedGiveaway.prize || 'Phần thưởng bí ẩn!', inline: true },
                                { name: '🏆 Người thắng', value: winnerMentions, inline: false },
                                { name: '👥 Tổng tham gia', value: endResult.participantCount.toString(), inline: true }
                            ]
                        }
                    });
                } catch (logError) {
                    logger.debug('Error logging giveaway winner event:', logError);
                }
            } else {
                await channel.send({
                    content: `Giveaway cho phần thưởng **${updatedGiveaway.prize}** đã kết thúc mà không có người tham gia hợp lệ.`,
                });
                logger.info(`Giveaway ended with no winners: ${messageId}`);
            }

            logger.info(`Giveaway successfully ended by ${interaction.user.tag}: ${messageId}`);

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        "Giveaway đã kết thúc ✅",
                        `Đã kết thúc giveaway cho **${updatedGiveaway.prize}** tại ${channel}. Chọn được ${winners.length} người thắng từ ${endResult.participantCount} lượt tham gia.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'gend',
                context: 'giveaway_end'
            });
        }
    },
};