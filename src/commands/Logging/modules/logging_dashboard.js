import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import { getColor } from '../../../config/bot.js';
import { getGuildConfig } from '../../../services/guildConfig.js';
import { getLoggingStatus, EVENT_TYPES } from '../../../services/loggingService.js';
import { createLoggingDashboardComponents } from '../../../utils/loggingUi.js';
import { errorEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

const EVENT_TYPES_BY_CATEGORY = Object.values(EVENT_TYPES).reduce((acc, eventType) => {
    const [category] = eventType.split('.');
    if (!acc[category]) acc[category] = [];
    acc[category].push(eventType);
    return acc;
}, {});

const CATEGORY_MAP = [
    ['moderation',   '🔨 Sự kiện Quản trị'],
    ['ticket',       '🎫 Sự kiện Ticket'],
    ['message',      '✉️ Sự kiện Tin nhắn'],
    ['role',         '🏷️ Sự kiện Vai trò'],
    ['member',       '👥 Sự kiện Thành viên'],
    ['leveling',     '📈 Sự kiện Cấp độ'],
    ['reactionrole', '🎭 Sự kiện Reaction Role'],
    ['giveaway',     '🎁 Sự kiện Giveaway'],
    ['counter',      '📊 Sự kiện Bộ đếm'],
];

function getCategoryStatus(enabledEvents, category, auditEnabled) {
    if (!auditEnabled) return false;
    const events = enabledEvents || {};
    if (events[`${category}.*`] === false) return false;
    const categoryEvents = EVENT_TYPES_BY_CATEGORY[category] || [];
    if (categoryEvents.length === 0) return true;
    return categoryEvents.every((eventType) => events[eventType] !== false);
}

async function formatChannelMention(guild, id) {
    if (!id) return '`Chưa cấu hình`';
    const channel = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
    return channel ? channel.toString() : `⚠️ Thiếu (${id})`;
}

export async function buildLoggingDashboardView(interaction, client) {
    const guildConfig = await getGuildConfig(client, interaction.guildId);
    const loggingStatus = await getLoggingStatus(client, interaction.guildId);

    const auditEnabled = Boolean(loggingStatus.enabled);
    const auditChannel = await formatChannelMention(
        interaction.guild,
        loggingStatus.channelId || guildConfig.logging?.channelId || guildConfig.logChannelId,
    );
    const lifecycleChannel = await formatChannelMention(interaction.guild, guildConfig.ticketLogsChannelId);
    const transcriptChannel = await formatChannelMention(interaction.guild, guildConfig.ticketTranscriptChannelId);

    const ignoredUsers = guildConfig.logIgnore?.users || [];
    const ignoredChannels = guildConfig.logIgnore?.channels || [];

    const categoryLines = CATEGORY_MAP.map(([key, label]) => {
        const on = getCategoryStatus(loggingStatus.enabledEvents, key, auditEnabled);
        return `${on ? '✅' : '❌'} ${label}`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setTitle('📋 Bảng điều khiển Nhật ký (Logging)')
        .setDescription(`Quản lý nhật ký kiểm duyệt cho **${interaction.guild.name}**. Các nút danh mục giúp bật/tắt nhật ký ngay lập tức.`)
        .setColor(auditEnabled ? getColor('success') : getColor('warning'))
        .addFields(
            {
                name: '🧾 Trạng thái Logging',
                value: auditEnabled ? '✅ Đã bật' : '❌ Đã tắt',
                inline: true,
            },
            {
                name: '\u200B',
                value: '\u200B',
                inline: true,
            },
            {
                name: '\u200B',
                value: '\u200B',
                inline: true,
            },
            {
                name: '📡 Các kênh Nhật ký',
                value: [
                    `**Kiểm duyệt:** ${auditChannel}`,
                    `**Nhật ký Ticket:** ${lifecycleChannel}`,
                    `**Bản ghi Ticket:** ${transcriptChannel}`,
                ].join('\n'),
                inline: false,
            },
            {
                name: '📋 Danh mục sự kiện',
                value: categoryLines,
                inline: false,
            },
            {
                name: '🧹 Bộ lọc bỏ qua',
                value: `Người dùng: **${ignoredUsers.length}**\nKênh: **${ignoredChannels.length}**`,
                inline: true,
            },
            {
                name: '🕒 Cập nhật lần cuối',
                value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                inline: true,
            },
        )
        .setFooter({ text: 'Dùng /logging setchannel để cấu hình kênh nhật ký • Dùng /ticket setup hoặc /ticket dashboard để cấu hình kênh ticket' })
        .setTimestamp();

    const components = createLoggingDashboardComponents(loggingStatus.enabledEvents, auditEnabled);
    return { embed, components };
}

export default {
    async execute(interaction, config, client) {
        try {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Từ chối quyền truy cập', 'Bạn cần quyền **Quản lý máy chủ** để xem bảng điều khiển nhật ký.')],
                });
            }

            await InteractionHelper.safeDefer(interaction);
            const { embed, components } = await buildLoggingDashboardView(interaction, client);
            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components });
        } catch (error) {
            logger.error('logging_dashboard error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Lỗi bảng điều khiển', 'Không thể tải bảng điều khiển nhật ký.')],
            });
        }
    },
};