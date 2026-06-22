import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { LughxBotError, ErrorTypes } from '../../utils/errorHandler.js';


import { InteractionHelper } from '../../utils/interactionHelper.js';
const durationChoices = [
    { name: "5 phút", value: 5 },
    { name: "10 phút", value: 10 },
    { name: "30 phút", value: 30 },
    { name: "1 giờ", value: 60 },
    { name: "6 giờ", value: 360 },
    { name: "1 ngày", value: 1440 },
    { name: "1 tuần", value: 10080 },
];
export default {
    data: new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("Đình chỉ (timeout) một người dùng trong một khoảng thời gian.")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("Người dùng muốn đình chỉ")
                .setRequired(true),
        )
        .addIntegerOption(
            (option) =>
                option
                    .setName("duration")
                    .setDescription("Thời gian đình chỉ")
                    .setRequired(true)
                    .addChoices(...durationChoices),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Lý do đình chỉ"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Lỗi defer tương tác lệnh timeout`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'timeout'
            });
            return;
        }

        try {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                throw new LughxBotError(
                    "User lacks permission",
                    ErrorTypes.PERMISSION,
                    "Bạn cần quyền `Quản lý thành viên` để thực hiện đình chỉ."
                );
            }

            const targetUser = interaction.options.getUser("target");
            const member = interaction.options.getMember("target");
            const durationMinutes = interaction.options.getInteger("duration");
            const reason = interaction.options.getString("reason") || "Không có lý do nào được cung cấp";

            if (targetUser.id === interaction.user.id) {
                throw new LughxBotError(
                    "Cannot timeout self",
                    ErrorTypes.VALIDATION,
                    "Bạn không thể tự đình chỉ chính mình."
                );
            }
            if (targetUser.id === client.user.id) {
                throw new LughxBotError(
                    "Cannot timeout bot",
                    ErrorTypes.VALIDATION,
                    "Bạn không thể đình chỉ bot."
                );
            }
            if (!member) {
                throw new LughxBotError(
                    "Target not found",
                    ErrorTypes.USER_INPUT,
                    "Người dùng mục tiêu hiện không có trong máy chủ này."
                );
            }

            if (!member.moderatable) {
                throw new LughxBotError(
                    "Cannot timeout member",
                    ErrorTypes.PERMISSION,
                    "Tôi không thể đình chỉ người dùng này. Có thể họ có vai trò cao hơn tôi hoặc bạn."
                );
            }

            const durationMs = durationMinutes * 60 * 1000;
            await member.timeout(durationMs, reason);

            const durationDisplay =
                durationChoices.find((c) => c.value === durationMinutes)
                    ?.name || `${durationMinutes} phút`;

            const caseId = await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: "Member Timed Out",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `${reason}\nThời gian: ${durationDisplay}`,
                    duration: durationDisplay,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                        durationMinutes,
                        timeoutEnds: new Date(Date.now() + durationMs).toISOString()
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `⏳ **Đã đình chỉ** ${targetUser.tag} trong ${durationDisplay}.`,
                        `**Lý do:** ${reason}\n**ID vụ việc:** #${caseId}`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Lỗi lệnh timeout:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        error.userMessage || "Đã xảy ra lỗi không mong muốn khi thực hiện đình chỉ. Vui lòng kiểm tra quyền vai trò của bot.",
                    ),
                ],
            });
        }
    }
};