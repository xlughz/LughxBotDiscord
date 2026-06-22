import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { LughxBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { getGuildGiveaways, saveGiveaway } from '../../utils/giveaways.js';
import { 
    selectWinners,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("greroll")
        .setDescription("Chọn lại người chiến thắng cho một giveaway đã kết thúc.")
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("ID tin nhắn của giveaway đã kết thúc.")
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
                    "Bạn cần quyền 'Quản lý máy chủ' để quay lại giveaway.",
                    { userId: interaction.user.id, guildId: interaction.guildId }
                );
            }

            logger.info(`Giveaway reroll initiated by ${interaction.user.tag} in guild ${interaction.guildId}`);

            const messageId = interaction.options.getString("messageid");
            
            if (!messageId || !/^\d+$/.test(messageId)) {
                throw new LughxBotError(
                    'Invalid message ID format',
                    ErrorTypes.VALIDATION,
                    'Vui lòng cung cấp ID tin nhắn hợp lệ.',
                    { providedId: messageId }
                );
            }

            const giveaways = await getGuildGiveaways(
                interaction.client,
                interaction.guildId,
            );
            
            const giveaway = giveaways.find(g => g.messageId === messageId);

            if (!giveaway) {
                throw new LughxBotError(
                    `Giveaway not found: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    "Không tìm thấy giveaway nào với ID tin nhắn đó trong cơ sở dữ liệu.",
                    { messageId, guildId: interaction.guildId }
                );
            }
            
            if (!giveaway.isEnded && !giveaway.ended) {
                throw new LughxBotError(
                    `Giveaway still active: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    "Giveaway này vẫn đang diễn ra. Vui lòng sử dụng `/gend` để kết thúc trước.",
                    { messageId, status: 'active' }
                );
            }

            const participants = giveaway.participants || [];
            
            if (participants.length < giveaway.winnerCount) {
                throw new LughxBotError(
                    `Insufficient participants for reroll: ${participants.length} < ${giveaway.winnerCount}`,
                    ErrorTypes.VALIDATION,
                    "Không đủ người tham gia để chọn số lượng người chiến thắng yêu cầu.",
                    { participantsCount: participants.length, winnersNeeded: giveaway.winnerCount }
                );
            }
            
            const newWinners = selectWinners(
                participants,
                giveaway.winnerCount,
            );
            
            const updatedGiveaway = {
                ...giveaway,
                winnerIds: newWinners,
                rerolledAt: new Date().toISOString(),
                rerolledBy: interaction.user.id
            };
            
            const channel = await interaction.client.channels.fetch(
                giveaway.channelId,
            ).catch(err => {
                logger.warn(`Could not fetch channel ${giveaway.channelId}:`, err.message);
                return null;
            });

            if (!channel || !channel.isTextBased()) {
                await saveGiveaway(
                    interaction.client,
                    interaction.guildId,
                    updatedGiveaway,
                );
                
                logger.warn(`Could not find channel for giveaway ${messageId}, but saved new winners to database`);
                
                return InteractionHelper.safeReply(interaction, {
                    embeds: [
                        successEmbed(
                            "Quay lại hoàn tất",
                            "Người chiến thắng mới đã được chọn và lưu vào cơ sở dữ liệu. Không thể tìm thấy kênh để thông báo.",
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }
            
            const message = await channel.messages
                .fetch(messageId)
                .catch(err => {
                    logger.warn(`Could not fetch message ${messageId}:`, err.message);
                    return null;
                });

            if (!message) {
                await saveGiveaway(
                    interaction.client,
                    interaction.guildId,
                    updatedGiveaway,
                );

                const winnerMentions = newWinners
                    .map((id) => `<@${id}>`)
                    .join(", ");
                
                const existingPingMsg = giveaway.winnerPingMessageId
                    ? await channel.messages.fetch(giveaway.winnerPingMessageId).catch(() => null)
                    : null;
                if (existingPingMsg) {
                    await existingPingMsg.edit({
                        content: `🔄 **QUAY LẠI GIVEAWAY** 🔄 Người chiến thắng mới cho **${giveaway.prize}**: ${winnerMentions}!`,
                    });
                } else {
                    const newPingMsg = await channel.send({
                        content: `🔄 **QUAY LẠI GIVEAWAY** 🔄 Người chiến thắng mới cho **${giveaway.prize}**: ${winnerMentions}!`,
                    });
                    updatedGiveaway.winnerPingMessageId = newPingMsg.id;
                }

                logger.info(`Giveaway rerolled (message not found, but announced): ${messageId}`);

                try {
                    await logEvent({
                        client: interaction.client,
                        guildId: interaction.guildId,
                        eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                        data: {
                            description: `Giveaway quay lại: ${giveaway.prize}`,
                            channelId: giveaway.channelId,
                            userId: interaction.user.id,
                            fields: [
                                { name: '🎁 Phần thưởng', value: giveaway.prize || 'Phần thưởng bí ẩn!', inline: true },
                                { name: '🏆 Người thắng mới', value: winnerMentions, inline: false },
                                { name: '👥 Tổng lượt tham gia', value: participants.length.toString(), inline: true }
                            ]
                        }
                    });
                } catch (logError) {
                    logger.debug('Error logging giveaway reroll:', logError);
                }

                return InteractionHelper.safeReply(interaction, {
                    embeds: [
                        successEmbed(
                            "Quay lại hoàn tất",
                            `Người chiến thắng mới đã được công bố tại ${channel}. (Không tìm thấy tin nhắn gốc).`,
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }
            
            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                updatedGiveaway,
            );

            const newEmbed = createGiveawayEmbed(updatedGiveaway, "reroll", newWinners);
            const newRow = createGiveawayButtons(true);

            await message.edit({
                content: "🔄 **GIVEAWAY ĐÃ ĐƯỢC QUAY LẠI** 🔄",
                embeds: [newEmbed],
                components: [newRow],
            });

            const winnerMentions = newWinners
                .map((id) => `<@${id}>`)
                .join(", ");
            
            const existingPingMsg = giveaway.winnerPingMessageId
                ? await channel.messages.fetch(giveaway.winnerPingMessageId).catch(() => null)
                : null;
            if (existingPingMsg) {
                await existingPingMsg.edit({
                    content: `🔄 **NGƯỜI THẮNG MỚI** 🔄 CHÚC MỪNG ${winnerMentions}! Bạn là người chiến thắng mới cho giveaway **${giveaway.prize}**! Vui lòng liên hệ host <@${giveaway.hostId}> để nhận thưởng.`,
                });
            } else {
                const newPingMsg = await channel.send({
                    content: `🔄 **NGƯỜI THẮNG MỚI** 🔄 CHÚC MỪNG ${winnerMentions}! Bạn là người chiến thắng mới cho giveaway **${giveaway.prize}**! Vui lòng liên hệ host <@${giveaway.hostId}> để nhận thưởng.`,
                });
                updatedGiveaway.winnerPingMessageId = newPingMsg.id;
            }

            logger.info(`Giveaway successfully rerolled: ${messageId} with ${newWinners.length} new winners`);

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                    data: {
                        description: `Giveaway quay lại: ${giveaway.prize}`,
                        channelId: giveaway.channelId,
                        userId: interaction.user.id,
                        fields: [
                            { name: '🎁 Phần thưởng', value: giveaway.prize || 'Phần thưởng bí ẩn!', inline: true },
                            { name: '🏆 Người thắng mới', value: winnerMentions, inline: false },
                            { name: '👥 Tổng lượt tham gia', value: participants.length.toString(), inline: true }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Error logging giveaway reroll event:', logError);
            }

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        "Quay lại thành công ✅",
                        `Đã quay lại giveaway cho **${giveaway.prize}** tại ${channel}. Đã chọn ${newWinners.length} người chiến thắng mới.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            logger.error('Error in greroll command:', error);
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'greroll',
                context: 'giveaway_reroll'
            });
        }
    },
};