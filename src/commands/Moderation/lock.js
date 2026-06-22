import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("lock")
        .setDescription(
            "Khóa kênh hiện tại (ngăn @everyone gửi tin nhắn).",
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Lỗi defer tương tác lệnh lock`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'lock'
            });
            return;
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels))
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Từ chối quyền truy cập",
                        "Bạn cần quyền `Quản lý kênh` để khóa kênh.",
                    ),
                ],
            });

        const channel = interaction.channel;
        const everyoneRole = interaction.guild.roles.everyone;

        try {
            const currentPermissions = channel.permissionsFor(everyoneRole);
            if (currentPermissions.has(PermissionFlagsBits.SendMessages) === false) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Kênh đã bị khóa",
                            `${channel} đã bị khóa từ trước.`,
                        ),
                    ],
                });
            }

            await channel.permissionOverwrites.edit(
                everyoneRole,
                { SendMessages: false },
                { type: 0, reason: `Kênh được khóa bởi ${interaction.user.tag}` },
            );

            const lockEmbed = createEmbed(
                "🔒 Kênh đã bị khóa (Nhật ký hành động)",
                `${channel} đã bị khóa bởi ${interaction.user}.`,
            )
                .setColor(getColor('moderation'))
                .addFields(
                    { name: "Kênh", value: channel.toString(), inline: true },
                    {
                        name: "Người điều hành",
                        value: `${interaction.user.tag} (${interaction.user.id})`,
                        inline: true,
                    },
                );

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Kênh đã bị khóa",
                    target: channel.toString(),
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: {
                        channelId: channel.id,
                        category: channel.parent?.name || 'Không có',
                        moderatorId: interaction.user.id
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `🔒 **Kênh đã bị khóa**`,
                        `${channel} hiện đã bị khóa. Không ai có thể gửi tin nhắn tại đây nữa.`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Lỗi lệnh lock:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Đã xảy ra lỗi không mong muốn khi cố gắng khóa kênh. Hãy kiểm tra quyền hạn của bot (cần quyền 'Quản lý kênh').",
                    ),
                ],
            });
        }
    }
};