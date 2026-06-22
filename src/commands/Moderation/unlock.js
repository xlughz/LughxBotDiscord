import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("unlock")
        .setDescription(
            "Mở khóa kênh hiện tại (cho phép @everyone gửi tin nhắn trở lại).",
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Lỗi defer tương tác lệnh unlock`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'unlock'
            });
            return;
        }

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        )
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Từ chối quyền truy cập",
                        "Bạn cần quyền `Quản lý kênh` để mở khóa kênh.",
                    ),
                ],
            });

        const channel = interaction.channel;
        const everyoneRole = interaction.guild.roles.everyone;

        try {
            const currentPermissions = channel.permissionsFor(everyoneRole);
            if (
                currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                    true ||
                currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                    null
            ) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Kênh đã được mở khóa",
                            `${channel} không bị khóa (mọi người đã có thể gửi tin nhắn).`,
                        ),
                    ],
                });
            }

            await channel.permissionOverwrites.edit(
                everyoneRole,
                { SendMessages: true },
                {
                    type: 0,
                    reason: `Kênh được mở khóa bởi ${interaction.user.tag}`,
                },
            );

            const unlockEmbed = createEmbed(
                "🔓 Kênh đã được mở khóa (Nhật ký hành động)",
                `${channel} đã được mở khóa bởi ${interaction.user}.`,
            )
                .setColor(getColor('success'))
                .addFields(
                    {
                        name: "Kênh",
                        value: channel.toString(),
                        inline: true,
                    },
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
                    action: "Kênh đã được mở khóa",
                    target: channel.toString(),
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: {
                        channelId: channel.id,
                        category: channel.parent?.name || 'Không có'
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `🔓 **Kênh đã được mở khóa**`,
                        `${channel} hiện đã được mở khóa. Bạn có thể trò chuyện lại tại đây.`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Lỗi lệnh unlock:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Đã xảy ra lỗi không mong muốn khi mở khóa kênh. Hãy kiểm tra quyền hạn của bot (cần quyền 'Quản lý kênh').",
                    ),
                ],
            });
        }
    }
};