import { getColor } from '../../../config/bot.js';
import { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, getCounterEmoji, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export async function handleDelete(interaction, client) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");
    
    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Không thể defer phản hồi:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await InteractionHelper.safeEditReply(interaction, { 
            embeds: [errorEmbed("Bạn cần quyền **Quản lý kênh** để xóa bộ đếm.")]
        }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        if (counters.length === 0) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Không tìm thấy bộ đếm nào để xóa.")]
            }).catch(logger.error);
            return;
        }

        const counterToDelete = counters.find(c => c.id === counterId);
        if (!counterToDelete) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(`Không tìm thấy bộ đếm với ID \`${counterId}\`. Sử dụng \`/counter list\` để xem tất cả bộ đếm.`)]
            }).catch(logger.error);
            return;
        }

        const channel = guild.channels.cache.get(counterToDelete.channelId);

        const embed = createEmbed({
            title: "⚠️ Xóa bộ đếm & kênh",
            description: `Bạn có chắc chắn muốn xóa bộ đếm này cùng với kênh của nó không?\n\n**ID:** \`${counterToDelete.id}\`\n**Loại:** ${getCounterTypeDisplay(counterToDelete.type)}\n**Kênh:** ${channel || 'Kênh đã bị xóa'}\n\n⚠️ **Kênh này sẽ bị xóa vĩnh viễn!**`,
            color: getColor('error')
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`counter-delete:confirm:${counterToDelete.id}:${interaction.user.id}`)
                .setLabel("Xác nhận xóa")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`counter-delete:cancel:${counterToDelete.id}:${interaction.user.id}`)
                .setLabel("Hủy bỏ")
                .setStyle(ButtonStyle.Secondary)
        );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [row] }).catch(logger.error);

    } catch (error) {
        logger.error("Lỗi trong handleDelete:", error);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("Đã xảy ra lỗi khi truy xuất bộ đếm. Vui lòng thử lại.")]
        }).catch(logger.error);
    }
}

export async function performDeletionByCounterId(client, guild, counterId) {
    try {
        const counters = await getServerCounters(client, guild.id);

        const counter = counters.find(c => c.id === counterId);
        if (!counter) {
            return {
                success: false,
                message: `Không tìm thấy bộ đếm với ID \`${counterId}\`.`
            };
        }

        const updatedCounters = counters.filter(c => c.id !== counter.id);

        const saved = await saveServerCounters(client, guild.id, updatedCounters);
        if (!saved) {
            return {
                success: false,
                message: "Không thể xóa bộ đếm. Vui lòng thử lại."
            };
        }

        const channel = guild.channels.cache.get(counter.channelId);
        let channelDeleted = false;

        if (channel) {
            try {
                await channel.delete(`Bộ đếm đã bị xóa - đang xóa kênh: ${counter.id}`);
                channelDeleted = true;
            } catch (error) {
                logger.error("Lỗi khi xóa kênh:", error);
            }
        }

        let message = `✅ **Xóa bộ đếm thành công!**\n\n**ID:** \`${counter.id}\`\n**Loại:** ${getCounterTypeDisplay(counter.type)}`;
        
        if (channelDeleted) {
            message += `\n**Kênh:** ${channel.name} (đã xóa)`;
        } else if (channel) {
            message += `\n**Kênh:** ${channel.name} (xóa thất bại)`;
        } else {
            message += `\n**Kênh:** Đã xóa từ trước`;
        }

        return {
            success: true,
            message
        };

    } catch (error) {
        logger.error("Lỗi khi xóa bộ đếm:", error);
        return {
            success: false,
            message: "Đã xảy ra lỗi khi xóa bộ đếm. Vui lòng thử lại."
        };
    }
}

function getCounterTypeDisplay(type) {
    return `${getCounterEmoji(type)} ${getCounterTypeLabel(type)}`;
}