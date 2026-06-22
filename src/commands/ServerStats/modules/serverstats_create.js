import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter, getCounterBaseName, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export async function handleCreate(interaction, client) {
    const guild = interaction.guild;
    const type = interaction.options.getString("type");
    const channelType = interaction.options.getString("channel_type");
    const category = interaction.options.getChannel("category");

    // Defer reply để đảm bảo tương tác được phản hồi
    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Không thể defer phản hồi:", error);
        return;
    }

    // Kiểm tra quyền sau khi defer
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await InteractionHelper.safeEditReply(interaction, { 
            embeds: [errorEmbed("Bạn cần quyền **Quản lý kênh** để tạo bộ đếm.")]
        }).catch(logger.error);
        return;
    }

    try {
        if (!category || category.type !== ChannelType.GuildCategory) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Vui lòng chọn một danh mục hợp lệ cho kênh bộ đếm.")]
            }).catch(logger.error);
            return;
        }

        const targetChannelType = channelType === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
        const baseChannelName = getCounterBaseName(type);

        const counters = await getServerCounters(client, guild.id);
        const duplicateType = counters.find(counter => counter.type === type);

        if (duplicateType) {
            const duplicateChannel = guild.channels.cache.get(duplicateType.channelId);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(`Đã tồn tại bộ đếm **${getCounterTypeLabel(type)}** trong máy chủ này${duplicateChannel ? ` tại ${duplicateChannel}` : ''}. Vui lòng xóa nó trước khi tạo mới.`)]
            }).catch(logger.error);
            return;
        }

        const targetChannel = await guild.channels.create({
            name: baseChannelName,
            type: targetChannelType,
            parent: category.id,
            reason: `Kênh bộ đếm được tạo bởi ${interaction.user.tag}`
        });

        const existingCounter = counters.find(c => c.channelId === targetChannel.id);
        if (existingCounter) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(`Bộ đếm đã tồn tại cho kênh **${targetChannel.name}**. Vui lòng xóa nó trước hoặc chọn loại khác.`)]
            }).catch(logger.error);
            return;
        }

        const newCounter = {
            id: Date.now().toString(),
            type: type,
            channelId: targetChannel.id,
            guildId: guild.id,
            createdAt: new Date().toISOString(),
            enabled: true
        };

        counters.push(newCounter);

        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            await targetChannel.delete('Tạo bộ đếm thất bại trong khi lưu dữ liệu').catch(() => null);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Không thể lưu dữ liệu bộ đếm. Vui lòng thử lại.")]
            }).catch(logger.error);
            return;
        }

        const updated = await updateCounter(client, guild, newCounter);
        if (!updated) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Đã tạo bộ đếm nhưng thất bại khi cập nhật tên kênh. Bộ đếm sẽ tự động cập nhật vào lần chạy tiếp theo.")]
            }).catch(logger.error);
            return;
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(`✅ **Tạo bộ đếm thành công!**\n\n**Loại:** ${getCounterTypeLabel(type)}\n**Loại kênh:** ${targetChannel.type === ChannelType.GuildVoice ? 'thoại' : 'văn bản'}\n**Danh mục:** ${category}\n**Kênh:** ${targetChannel}\n**Tên kênh:** ${targetChannel.name}\n**ID bộ đếm:** \`${newCounter.id}\`\n\nBộ đếm sẽ tự động cập nhật mỗi 15 phút.\n\nSử dụng \`/counter list\` để xem tất cả bộ đếm.`)]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Lỗi khi tạo bộ đếm:", error);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("Đã xảy ra lỗi khi tạo bộ đếm. Vui lòng thử lại.")]
        }).catch(logger.error);
    }
}