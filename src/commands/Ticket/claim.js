import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';
import { claimTicket } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("claim")
        .setDescription("Nhận tiếp nhận một vé hỗ trợ (ticket), gán vé đó cho bạn.")
        .setDMPermission(false),

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
                            "Bạn cần quyền `Quản lý kênh` hoặc `Vai trò nhân viên hỗ trợ` đã được cấu hình để tiếp nhận vé.",
                        ),
                    ],
                });
            }

            const channel = interaction.channel;
            const result = await claimTicket(channel, interaction.user);
            
            if (!result.success) {
                logger.warn('Tiếp nhận vé thất bại - không phải kênh vé hợp lệ', {
                    userId: interaction.user.id,
                    channelId: channel.id,
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
                        "Đã tiếp nhận vé!",
                        "Bạn đã tiếp nhận vé này thành công.",
                    ),
                ],
            });

            logger.info('Vé đã được tiếp nhận thành công', {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                channelId: channel.id,
                channelName: channel.name,
                guildId: interaction.guildId,
                commandName: 'claim'
            });

        } catch (error) {
            logger.error('Lỗi khi thực thi lệnh claim', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                channelId: interaction.channel?.id,
                guildId: interaction.guildId,
                commandName: 'claim'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'claim',
                source: 'ticket_claim_command'
            });
        }
    },
};