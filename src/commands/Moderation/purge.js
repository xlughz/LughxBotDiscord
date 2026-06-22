import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { checkRateLimit } from '../../utils/rateLimiter.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("purge")
        .setDescription("Xóa một số lượng tin nhắn cụ thể")
        .addIntegerOption((option) =>
            option
                .setName("amount")
                .setDescription("Số lượng tin nhắn (1-100)")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Lỗi defer tương tác lệnh purge`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'purge'
            });
            return;
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages))
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Từ chối quyền truy cập",
                        "Bạn cần quyền `Quản lý tin nhắn` để xóa tin nhắn.",
                    ),
                ],
            });

        const amount = interaction.options.getInteger("amount");
        const channel = interaction.channel;

        if (amount < 1 || amount > 100)
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Số lượng không hợp lệ",
                        "Vui lòng chỉ định một số từ 1 đến 100.",
                    ),
                ],
            });

        try {
            
            const rateLimitKey = `purge_${interaction.user.id}`;
            const isAllowed = await checkRateLimit(rateLimitKey, 5, 60000);
            if (!isAllowed) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        warningEmbed(
                            "Bạn đang xóa tin nhắn quá nhanh. Vui lòng đợi một phút trước khi thử lại.",
                            "⏳ Giới hạn tốc độ (Rate Limited)"
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const fetched = await channel.messages.fetch({ limit: amount });
            const deleted = await channel.bulkDelete(fetched, true);
            const deletedCount = deleted.size;

            const purgeEmbed = createEmbed(
                "🗑️ Tin nhắn đã bị xóa (Nhật ký hành động)",
                `${deletedCount} tin nhắn đã bị xóa bởi ${interaction.user}.`,
            )
                .setColor(getColor('moderation'))
                .addFields(
                    { name: "Kênh", value: channel.toString(), inline: true },
                    {
                        name: "Người điều hành",
                        value: `${interaction.user.tag} (${interaction.user.id})`,
                        inline: true,
                    },
                    { name: "Số lượng", value: `${deletedCount} tin nhắn`, inline: false },
                );

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Tin nhắn đã bị xóa",
                    target: `${channel} (${deletedCount} tin nhắn)`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `Đã xóa ${deletedCount} tin nhắn`,
                    metadata: {
                        channelId: channel.id,
                        messageCount: deletedCount,
                        requestedAmount: amount,
                        moderatorId: interaction.user.id
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(`🗑️ Đã xóa ${deletedCount} tin nhắn trong ${channel}.`),
                ],
                flags: MessageFlags.Ephemeral,
            });

            setTimeout(() => {
                interaction.deleteReply().catch(err => 
                    logger.debug('Không thể tự động xóa phản hồi lệnh purge:', err)
                );
            }, 3000);
        } catch (error) {
            logger.error('Lỗi lệnh purge:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Đã xảy ra lỗi không mong muốn khi xóa tin nhắn. Lưu ý: Tin nhắn cũ hơn 14 ngày không thể xóa hàng loạt.",
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }
    }
};