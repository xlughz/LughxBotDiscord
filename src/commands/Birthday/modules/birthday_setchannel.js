import { PermissionsBitField, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed(
                    'Từ Chối Quyền Hạn', 
                    'Bạn cần có quyền **Quản lý Máy chủ** để cấu hình kênh thông báo sinh nhật.'
                )],
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            const channel = interaction.options.getChannel('channel');
            const guildId = interaction.guildId;
            const guildConfig = await getGuildConfig(client, guildId);

            if (channel) {
                guildConfig.birthdayChannelId = channel.id;
                await setGuildConfig(client, guildId, guildConfig);
                return InteractionHelper.safeReply(interaction, {
                    embeds: [successEmbed(
                        '🎂 Đã Bật Thông Báo Sinh Nhật', 
                        `Các thông báo chúc mừng sinh nhật từ bây giờ sẽ được gửi vào kênh ${channel}.`
                    )],
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                guildConfig.birthdayChannelId = null;
                await setGuildConfig(client, guildId, guildConfig);
                return InteractionHelper.safeReply(interaction, {
                    embeds: [successEmbed(
                        '🎂 Đã Tắt Thông Báo Sinh Nhật', 
                        'Không có kênh nào được chỉ định — tính năng thông báo sinh nhật đã bị tắt.'
                    )],
                    flags: MessageFlags.Ephemeral,
                });
            }
        } catch (error) {
            logger.error('birthday_setchannel error:', error);
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed(
                    'Lỗi Cấu Hình', 
                    'Không thể lưu cấu hình kênh thông báo sinh nhật vào hệ thống.'
                )],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};