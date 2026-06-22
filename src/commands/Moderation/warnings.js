import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/warningService.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getColor } from '../../config/bot.js';

export default {
    data: new SlashCommandBuilder()
        .setName("warnings")
        .setDescription("Xem tất cả các cảnh cáo của một người dùng")
        .addUserOption((o) =>
            o
                .setName("target")
                .setRequired(true)
                .setDescription("Người dùng muốn kiểm tra cảnh cáo"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Lỗi defer tương tác lệnh warnings`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'warnings'
            });
            return;
        }

        try {
            const target = interaction.options.getUser("target");
            const guildId = interaction.guildId;

            const validWarnings = await WarningService.getWarnings(guildId, target.id);
            const totalWarns = validWarnings.length;

            if (totalWarns === 0) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createEmbed({ 
                            title: `Cảnh cáo: ${target.tag}`, 
                            description: "✅ Người dùng này không có cảnh cáo nào." 
                        }).setColor(getColor('success')),
                    ],
                });
                return;
            }

            const embed = createEmbed({ 
                title: `Cảnh cáo: ${target.tag}`, 
                description: `Tổng số cảnh cáo: **${totalWarns}**` 
            }).setColor(getColor('warning'));

            const warningFields = validWarnings
                .map((w, i) => {
                    const discordTimestamp = Math.floor(w.timestamp / 1000);
                    return {
                        name: `[#${i + 1}] Lý do: ${w.reason.substring(0, 100)}`,
                        value: `**Người điều hành:** <@${w.moderatorId}>\n**Ngày:** <t:${discordTimestamp}:F> (<t:${discordTimestamp}:R>)`,
                        inline: false,
                    };
                })
                .slice(0, 25);

            embed.addFields(warningFields);

            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`warning_delete_specific:${target.id}:${interaction.user.id}`)
                    .setLabel('Xóa cảnh cáo cụ thể')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`warning_clear_all:${target.id}:${interaction.user.id}`)
                    .setLabel('Xóa sạch cảnh cáo')
                    .setStyle(ButtonStyle.Danger)
            );

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Đã xem cảnh cáo",
                    target: `${target.tag} (${target.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `Đã xem ${totalWarns} cảnh cáo`,
                    metadata: {
                        userId: target.id,
                        moderatorId: interaction.user.id,
                        totalWarnings: totalWarns
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [actionRow] });
        } catch (error) {
            logger.error('Lỗi lệnh warnings:', error);
            await handleInteractionError(interaction, error, { subtype: 'warnings_view_failed' });
        }
    }
};