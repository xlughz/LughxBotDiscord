import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderationService.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Cấm (ban) một người dùng khỏi máy chủ")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("Người dùng muốn cấm")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Lý do cấm"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        try {
            const user = interaction.options.getUser("target");
            const reason = interaction.options.getString("reason") || "Không có lý do nào được cung cấp";

            if (user.id === interaction.user.id) {
                throw new Error("Bạn không thể tự cấm chính mình.");
            }
            if (user.id === client.user.id) {
                throw new Error("Bạn không thể cấm bot.");
            }
            
            const result = await ModerationService.banUser({
                guild: interaction.guild,
                user,
                moderator: interaction.member,
                reason
            });

            await InteractionHelper.universalReply(interaction, {
                embeds: [
                    successEmbed(
                        `🚫 **Đã cấm** ${user.tag}`,
                        `**Lý do:** ${reason}\n**ID vụ việc:** #${result.caseId}`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Lỗi lệnh ban:', error);
            await handleInteractionError(interaction, error, { subtype: 'ban_failed' });
        }
    },
};