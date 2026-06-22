import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getColor } from '../../config/bot.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { getLoggingStatus } from '../../services/loggingService.js';
import { getLevelingConfig } from '../../services/leveling.js';
import { getConfiguration as getJoinToCreateConfiguration } from '../../services/joinToCreateService.js';
import { getWelcomeConfig, getApplicationSettings } from '../../utils/database.js';
import { errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

function pill(enabled) {
    return enabled ? '✅ Bật' : '❌ Tắt';
}

async function formatChannelMention(guild, id) {
    if (!id) return '`Chưa cấu hình`';
    const channel = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
    return channel ? channel.toString() : `⚠️ Thiếu (${id})`;
}

function formatRoleMention(guild, id) {
    if (!id) return '`Chưa cấu hình`';
    const role = guild.roles.cache.get(id);
    return role ? role.toString() : `⚠️ Thiếu (${id})`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('overview')
        .setDescription('Xem trạng thái tổng quan của tất cả các hệ thống trong bot.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),

    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const [guildConfig, loggingStatus, levelingConfig, welcomeConfig, applicationConfig, joinToCreateConfig] =
                await Promise.all([
                    getGuildConfig(client, interaction.guildId),
                    getLoggingStatus(client, interaction.guildId),
                    getLevelingConfig(client, interaction.guildId),
                    getWelcomeConfig(client, interaction.guildId),
                    getApplicationSettings(client, interaction.guildId),
                    getJoinToCreateConfiguration(client, interaction.guildId),
                ]);

            const verificationEnabled = Boolean(guildConfig.verification?.enabled);
            const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
            const autoRoleId = guildConfig.autoRole || welcomeConfig?.roleIds?.[0];

            // ── Channels ──────────────────────────────────────────────────────
            const [auditChannel, lifecycleChannel, transcriptChannel, reportChannel, birthdayChannel] =
                await Promise.all([
                    formatChannelMention(interaction.guild, loggingStatus.channelId || guildConfig.logging?.channelId || guildConfig.logChannelId),
                    formatChannelMention(interaction.guild, guildConfig.ticketLogsChannelId),
                    formatChannelMention(interaction.guild, guildConfig.ticketTranscriptChannelId),
                    formatChannelMention(interaction.guild, guildConfig.reportChannelId),
                    formatChannelMention(interaction.guild, guildConfig.birthdayChannelId),
                ]);

            const embed = new EmbedBuilder()
                .setTitle('🖥️ Tổng Quan Hệ Thống')
                .setDescription(`Trạng thái các hệ thống tại **${interaction.guild.name}**. Sử dụng bảng điều khiển của từng lệnh để thay đổi cài đặt.`)
                .setColor(getColor('primary'))
                .addFields(
                    // ── Core systems ──
                    {
                        name: '⚙️ Các Hệ Thống Chính',
                        value: [
                            `🧾 **Nhật ký (Audit):** ${pill(Boolean(loggingStatus.enabled))}`,
                            `📈 **Cấp độ (Leveling):** ${pill(Boolean(levelingConfig?.enabled))}`,
                            `👋 **Chào mừng:** ${pill(Boolean(welcomeConfig?.enabled))}`,
                            `👋 **Tạm biệt:** ${pill(Boolean(welcomeConfig?.goodbyeEnabled))}`,
                            `🎂 **Sinh nhật:** ${pill(Boolean(guildConfig.birthdayChannelId))}`,
                            `📋 **Ứng tuyển:** ${pill(Boolean(applicationConfig?.enabled))}`,
                            `✅ **Xác minh:** ${pill(verificationEnabled)}`,
                            `🤖 **Tự động xác minh:** ${pill(autoVerifyEnabled)}`,
                            `🎧 **Phòng thoại động:** ${pill(Boolean(joinToCreateConfig?.enabled))}`,
                            `🛡️ **Tự động cấp role:** ${autoRoleId ? `✅ ${formatRoleMention(interaction.guild, autoRoleId)}` : '❌ Tắt'}`,
                        ].join('\n'),
                        inline: false,
                    },
                    // ── Channels ──
                    {
                        name: '📡 Các Kênh Đã Cấu Hình',
                        value: [
                            `**Nhật ký hệ thống:** ${auditChannel}`,
                            `**Ticket (vòng đời):** ${lifecycleChannel}`,
                            `**Ticket (transcript):** ${transcriptChannel}`,
                            `**Báo cáo lỗi:** ${reportChannel}`,
                            `**Sinh nhật:** ${birthdayChannel}`,
                        ].join('\n'),
                        inline: false,
                    },
                    // ── Refresh stamp ──
                    {
                        name: '🕒 Thời gian cập nhật',
                        value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                        inline: true,
                    },
                )
                .setFooter({ text: 'Chỉ đọc — sử dụng các lệnh điều khiển tương ứng để thay đổi cài đặt' })
                .setTimestamp();

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('overview command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Lỗi Tổng Quan', 'Không thể tải trạng thái hệ thống.')],
            });
        }
    },
};