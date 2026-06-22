import { PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter, getCounterEmoji, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export async function handleUpdate(interaction, client) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");
    const newType = interaction.options.getString("type");

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
            embeds: [errorEmbed("Bạn cần quyền **Quản lý kênh** để cập nhật bộ đếm.")]
        }).catch(logger.error);
        return;
    }

    if (!newType) {
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("Bạn phải cung cấp loại bộ đếm mới để cập nhật.")]
        }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        const counterIndex = counters.findIndex(c => c.id === counterId);
        if (counterIndex === -1) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(`Không tìm thấy bộ đếm với ID \`${counterId}\`. Sử dụng \`/counter list\` để xem tất cả bộ đếm.`)]
            }).catch(logger.error);
            return;
        }

        const counter = counters[counterIndex];
        const oldChannel = guild.channels.cache.get(counter.channelId);

        if (!oldChannel) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Kênh của bộ đếm này không còn tồn tại. Bạn không thể cập nhật bộ đếm cho một kênh đã bị xóa.")]
            }).catch(logger.error);
            return;
        }

        if (newType !== counter.type) {
            const existingTypeCounter = counters.find(c => c.type === newType && c.id !== counter.id);
            if (existingTypeCounter) {
                const existingChannel = guild.channels.cache.get(existingTypeCounter.channelId);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(`Đã tồn tại bộ đếm **${getCounterTypeLabel(newType)}** cho máy chủ này${existingChannel ? ` tại ${existingChannel}` : ''}. Vui lòng xóa nó trước khi sử dụng lại loại đó.`)]
                }).catch(logger.error);
                return;
            }
        }

        const oldType = counter.type;

        counter.type = newType;
        counter.updatedAt = new Date().toISOString();

        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Không thể lưu dữ liệu bộ đếm đã cập nhật. Vui lòng thử lại.")]
            }).catch(logger.error);
            return;
        }

        const updatedCounter = counters[counterIndex];
        const updated = await updateCounter(client, guild, updatedCounter);
        if (!updated) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Đã cập nhật bộ đếm nhưng thất bại khi cập nhật tên kênh. Bộ đếm sẽ tự động cập nhật vào lần chạy tiếp theo.")]
            }).catch(logger.error);
            return;
        }

        const finalChannel = guild.channels.cache.get(updatedCounter.channelId);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(`✅ **Cập nhật bộ đếm thành công!**\n\n**ID bộ đếm:** \`${counterId}\`\n**Loại thay đổi:** ${getCounterEmoji(oldType)} ${getCounterTypeLabel(oldType)} → ${getCounterEmoji(newType)} ${getCounterTypeLabel(newType)}\n\n**Cài đặt hiện tại:**\n**Loại:** ${getCounterEmoji(updatedCounter.type)} ${getCounterTypeLabel(updatedCounter.type)}\n**Kênh:** ${finalChannel}\n**Tên kênh:** ${finalChannel.name}\n\nBộ đếm sẽ tự động cập nhật mỗi 15 phút.`)]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Lỗi khi cập nhật bộ đếm:", error);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("Đã xảy ra lỗi khi cập nhật bộ đếm. Vui lòng thử lại.")]
        }).catch(logger.error);
    }
}