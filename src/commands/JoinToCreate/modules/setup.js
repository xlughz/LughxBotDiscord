import { SlashCommandBuilder, ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { LughxBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { addJoinToCreateTrigger, getJoinToCreateConfig } from '../../../utils/database.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        const category = interaction.options.getChannel('category');
        const nameTemplate = interaction.options.getString('channel_name') || "{username}'s Room";
        const userLimit = interaction.options.getInteger('user_limit') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild.id;

        try {
            // Tạo kênh thoại mới làm kênh kích hoạt (Trigger Channel)
            const triggerChannel = await interaction.guild.channels.create({
                name: 'Tham gia để tạo kênh',
                type: ChannelType.GuildVoice,
                parent: category?.id,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                    },
                ],
            });

            // Lưu cấu hình vào database
            await addJoinToCreateTrigger(client, guildId, triggerChannel.id, {
                nameTemplate: nameTemplate,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                categoryId: category?.id
            });

            const embed = successEmbed(
                `✅ Thiết lập "Join to Create" hoàn tất`,
                `Đã tạo kênh kích hoạt: ${triggerChannel}\n\n` +
                `**Cài đặt:**\n` +
                `• Mẫu tên kênh tạm thời: \`${nameTemplate}\`\n` +
                `• Giới hạn người dùng: ${userLimit === 0 ? 'Không giới hạn' : userLimit + ' người'}\n` +
                `• Tốc độ bit (Bitrate): ${bitrate} kbps\n` +
                `${category ? `• Danh mục: ${category.name}` : '• Danh mục: Không (cấp gốc)'}\n\n` +
                `Khi người dùng tham gia kênh này, một kênh thoại tạm thời sẽ được tự động tạo cho họ.`
            );

            try {
                if (interaction.deferred) {
                    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
                } else {
                    await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                }
            } catch (responseError) {
                logger.error('Lỗi khi phản hồi tương tác:', responseError);
                
                try {
                    if (!interaction.replied) {
                        await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                    }
                } catch (e) {
                    logger.error('Tất cả các nỗ lực phản hồi đều thất bại:', e);
                }
            }
        } catch (error) {
            if (error instanceof LughxBotError) {
                throw error;
            }
            logger.error('Lỗi trong quá trình thiết lập JoinToCreate:', error);
            throw new LughxBotError(
                `Thiết lập thất bại: ${error.message}`,
                ErrorTypes.DISCORD_API,
                'Không thể thiết lập hệ thống Join to Create.'
            );
        }
    }
};