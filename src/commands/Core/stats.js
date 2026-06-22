import { SlashCommandBuilder, version, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("stats")
        .setDescription("Xem thông số thống kê của bot"),

    async execute(interaction) {
        try {
            await InteractionHelper.safeDefer(interaction);
            
            const totalGuilds = interaction.client.guilds.cache.size;
            const totalMembers = interaction.client.guilds.cache.reduce(
                (acc, guild) => acc + guild.memberCount,
                0,
            );
            const nodeVersion = process.version;

            const embed = createEmbed({ 
                title: "📊 Thống Kê Hệ Thống", 
                description: "Các chỉ số hiệu suất thời gian thực." 
            }).addFields(
                { name: "Máy chủ", value: `${totalGuilds}`, inline: true },
                { name: "Người dùng", value: `${totalMembers}`, inline: true },
                { name: "Node.js", value: `${nodeVersion}`, inline: true },
                { name: "Discord.js", value: `v${version}`, inline: true },
                {
                    name: "Bộ nhớ sử dụng",
                    value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
                    inline: true,
                },
            );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('Stats command error:', error);
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({ title: 'Lỗi Hệ Thống', description: 'Không thể truy xuất thông số thống kê.', color: 'error' })],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};