import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';
import { updateTicketPriority } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("priority")
        .setDescription("Thiết lập mức độ ưu tiên cho vé hỗ trợ hiện tại.")
        .addStringOption((option) =>
            option
                .setName("level")
                .setDescription("Mức độ ưu tiên của vé.")
                .setRequired(true)
                .addChoices(
                    { name: "🔴 Khẩn cấp (Urgent)", value: "urgent" },
                    { name: "🟠 Cao (High)", value: "high" },
                    { name: "🟡 Trung bình (Medium)", value: "medium" },
                    { name: "🟢 Thấp (Low)", value: "low" },
                    { name: "⚪ Không có (None)", value: "none" },
                ),
        )
        .setDMPermission(false),
    category: "Ticket",

    async execute(interaction, guildConfig, client) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) {
                return;
            }

            const permissionContext = await getTicketPermissionContext({ client, interaction });
            if (!permissionContext.ticketData) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Không phải kênh vé",
                            "Lệnh này chỉ có thể được sử dụng trong một kênh vé hợp lệ.",
                        ),
                    ],
                });
            }

            if (!permissionContext.canManageTicket) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Từ chối quyền truy cập",
                            "Bạn cần quyền `Quản lý kênh` hoặc `Vai trò nhân viên hỗ trợ` được cấu hình để thay đổi mức độ ưu tiên.",
                        ),
                    ],
                });
            }

            const priorityLevel = interaction.options.getString("level");
            const result = await updateTicketPriority(interaction.channel, priorityLevel, interaction.user);
            
            if (!result.success) {
                logger.warn('Cập nhật độ ưu tiên thất bại - không phải kênh vé hợp lệ', {
                    userId: interaction.user.id,
                    channelId: interaction.channel.id,
                    guildId: interaction.guildId,
                    error: result.error
                });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Không phải kênh vé",
                            result.error || "Lệnh này chỉ có thể được sử dụng trong một kênh vé hợp lệ.",
                        ),
                    ],
                });
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "Đã cập nhật mức độ ưu tiên",
                        `Mức độ ưu tiên của vé đã được đặt thành **${priorityLevel.toUpperCase()}**.`,
                    ),
                ],
            });

            logger.info('Mức độ ưu tiên của vé đã được cập nhật thành công', {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                channelId: interaction.channel.id,
                channelName: interaction.channel.name,
                guildId: interaction.guildId,
                priority: priorityLevel,
                commandName: 'priority'
            });

        } catch (error) {
            logger.error('Lỗi khi thực thi lệnh priority', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                channelId: interaction.channel?.id,
                guildId: interaction.guildId,
                commandName: 'priority'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'priority',
                source: 'ticket_priority_command'
            });
        }
    },
};