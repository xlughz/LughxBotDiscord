import { getColor } from '../../../config/bot.js';
import { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, getCounterEmoji as getCounterTypeEmoji, getCounterTypeLabel, getGuildCounterStats } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export async function handleList(interaction, client) {
    const guild = interaction.guild;
    
    // Defer phản hồi ngay lập tức để xác nhận tương tác
    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Không thể defer phản hồi:", error);
        return;
    }
    
    // Kiểm tra quyền sau khi defer
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await InteractionHelper.safeEditReply(interaction, { 
            embeds: [errorEmbed("Bạn cần quyền **Quản lý kênh** để xem các bộ đếm.")]
        }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);
        const stats = await getGuildCounterStats(guild);

        // Dọn dẹp các bộ đếm bị mất kênh
        const validCounters = [];
        const orphanedCounters = [];
        
        for (const counter of counters) {
            const channel = guild.channels.cache.get(counter.channelId);
            if (channel) {
                validCounters.push(counter);
            } else {
                orphanedCounters.push(counter);
                logger.info(`Đang xóa bộ đếm mồ côi ${counter.id} (loại: ${counter.type}, kênh đã xóa: ${counter.channelId}) khỏi máy chủ ${guild.id}`);
            }
        }
        
        // Lưu lại danh sách bộ đếm đã được dọn dẹp
        if (orphanedCounters.length > 0) {
            await saveServerCounters(client, guild.id, validCounters);
            logger.info(`Đã dọn dẹp ${orphanedCounters.length} bộ đếm mồ côi khỏi máy chủ ${guild.id}`);
        }

        if (validCounters.length === 0) {
            const embed = createEmbed({
                title: "📋 Bộ đếm của máy chủ",
                description: "Chưa có bộ đếm nào được thiết lập cho máy chủ này.\n\nSử dụng `/counter create` để tạo bộ đếm đầu tiên!",
                color: getColor('warning')
            });

            embed.addFields({
                name: "🔧 **Các loại bộ đếm khả dụng**",
                value: "👥 **Thành viên + Bot** - Tổng số thành viên\n👤 **Chỉ thành viên** - Chỉ người dùng thật\n🤖 **Chỉ Bot** - Chỉ các tài khoản bot",
                inline: false
            });

            embed.addFields({
                name: "📝 **Ví dụ sử dụng**",
                value: "`/counter create type:members channel_type:voice category:Thống kê`\n`/counter create type:bots channel_type:text category:Thông tin`\n`/counter list`",
                inline: false
            });

            embed.setFooter({ 
                text: "Hệ thống bộ đếm • Tự động cập nhật mỗi 15 phút" 
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] }).catch(logger.error);
            return;
        }

        const embed = createEmbed({
            title: `📋 Bộ đếm của máy chủ (${validCounters.length})`,
            description: "Dưới đây là tất cả các bộ đếm đang hoạt động.\n\nBộ đếm sẽ tự động cập nhật mỗi 15 phút.",
            color: getColor('info')
        });

        for (let i = 0; i < validCounters.length; i++) {
            const counter = validCounters[i];
            const channel = guild.channels.cache.get(counter.channelId);
            
            if (!channel) continue;

            const currentCount = getCurrentCount(stats, counter.type);
            const status = channel.name.includes(':') ? '✅ Đang hoạt động' : '⚠️ Chưa cập nhật';
            
            embed.addFields({
                name: `${getCounterTypeEmoji(counter.type)} Bộ đếm #${i + 1} - ${channel.name}`,
                value: `**ID:** \`${counter.id}\`\n**Loại:** ${getCounterTypeDisplay(counter.type)}\n**Kênh:** ${channel}\n**Số lượng hiện tại:** ${currentCount}\n**Trạng thái:** ${status}\n**Ngày tạo:** ${new Date(counter.createdAt).toLocaleDateString()}`,
                inline: false
            });
        }

        embed.addFields({
            name: "📊 **Thống kê**",
            value: `**Tổng số bộ đếm:** ${validCounters.length}\n**Đang hoạt động:** ${validCounters.filter(c => {
                const channel = guild.channels.cache.get(c.channelId);
                return channel && channel.name.includes(':');
            }).length}\n**Cập nhật lần sau:** <t:${Math.floor(Date.now() / 1000) + 900}:R>`,
            inline: false
        });

        embed.addFields({
            name: "🔧 **Lệnh quản lý**",
            value: "`/counter create` - Tạo bộ đếm mới\n`/counter update` - Cập nhật bộ đếm hiện có\n`/counter delete` - Xóa bộ đếm",
            inline: false
        });

        embed.setFooter({ 
            text: "Hệ thống bộ đếm • Tự động cập nhật mỗi 15 phút" 
        });
        embed.setTimestamp();

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] }).catch(logger.error);

    } catch (error) {
        logger.error("Lỗi khi hiển thị bộ đếm:", error);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("Đã xảy ra lỗi khi truy xuất bộ đếm. Vui lòng thử lại.")]
        }).catch(logger.error);
    }
}

function getCounterTypeDisplay(type) {
    return `${getCounterTypeEmoji(type)} ${getCounterTypeLabel(type)}`;
}

function getCurrentCount(stats, type) {
    switch (type) {
        case "members":
            return stats.totalCount;
        case "bots":
            return stats.botCount;
        case "members_only":
            return stats.humanCount;
        default:
            return 0;
    }
}