import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderationService.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("unban")
        .setDescription("Gỡ cấm (unban) một người dùng khỏi máy chủ")
        .addUserOption(option =>
            option
                .setName("target")
                .setDescription("Người dùng muốn gỡ cấm (có thể là ID hoặc tag)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Lý do gỡ cấm")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Lỗi defer tương tác lệnh unban`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'unban'
            });
            return;
        }

        try {
            const targetUser = interaction.options.getUser("target");
            const reason = interaction.options.getString("reason") || "Không có lý do nào được cung cấp";
            
            const result = await ModerationService.unbanUser({
                guild: interaction.guild,
                user: targetUser,
                moderator: interaction.member,
                reason
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "✅ Đã gỡ cấm người dùng",
                        `Đã gỡ cấm thành công **${targetUser.tag}** khỏi máy chủ.\n\n**Lý do:** ${reason}\n**ID vụ việc:** #${result.caseId}`
                    )
                ]
            });
        } catch (error) {
            logger.error('Lỗi lệnh unban:', error);
            await handleInteractionError(interaction, error, { subtype: 'unban_failed' });
        }
    }
};