import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { LughxBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { 
    getJoinToCreateConfig, 
    updateJoinToCreateConfig,
    removeJoinToCreateTrigger,
    addJoinToCreateTrigger
} from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
        try {
            const triggerChannel = interaction.options.getChannel('trigger_channel');
            const guildId = interaction.guild.id;

            const currentConfig = await getJoinToCreateConfig(client, guildId);

            if (!currentConfig.triggerChannels.includes(triggerChannel.id)) {
                throw new LughxBotError(
                    `Channel ${triggerChannel.id} is not a Join to Create trigger`,
                    ErrorTypes.VALIDATION,
                    `${triggerChannel} hiện không được cấu hình là kênh kích hoạt "Join to Create".`
                );
            }

            const embed = new EmbedBuilder()
                .setTitle('⚙️ Cấu hình Join to Create')
                .setDescription(`Cấu hình cài đặt cho ${triggerChannel}`)
                .setColor(getColor('info'))
                .addFields(
                    {
                        name: '📝 Mẫu tên kênh hiện tại',
                        value: `\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                        inline: false
                    },
                    {
                        name: '👥 Giới hạn người dùng',
                        value: `${currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit === 0 ? 'Không giới hạn' : (currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit) + ' người'}`,
                        inline: true
                    },
                    {
                        name: '🎵 Tốc độ bit (Bitrate)',
                        value: `${(currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                        inline: true
                    }
                )
                .setFooter({ text: 'Chọn một tùy chọn bên dưới để cấu hình' })
                .setTimestamp();

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`jointocreate_config_${triggerChannel.id}`)
                .setPlaceholder('Chọn tùy chọn cấu hình')
                .addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Thay đổi mẫu tên kênh')
                        .setDescription('Điều chỉnh mẫu đặt tên cho các kênh tạm thời')
                        .setValue('name_template'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Thay đổi giới hạn người dùng')
                        .setDescription('Thiết lập số người tối đa trong kênh tạm thời')
                        .setValue('user_limit'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Thay đổi tốc độ bit')
                        .setDescription('Điều chỉnh chất lượng âm thanh cho kênh')
                        .setValue('bitrate'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Xóa kênh kích hoạt này')
                        .setDescription('Gỡ kênh này khỏi hệ thống Join to Create')
                        .setValue('remove_trigger'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Xem cài đặt hiện tại')
                        .setDescription('Hiển thị chi tiết cấu hình hiện tại')
                        .setValue('view_settings')
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
                components: [row],
            }).catch(error => {
                logger.error('Lỗi chỉnh sửa phản hồi trong config_setup:', error);
            });

            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: (i) => i.user.id === interaction.user.id && i.customId === `jointocreate_config_${triggerChannel.id}`,
                time: 60000
            });

            collector.on('collect', async (selectInteraction) => {
                await selectInteraction.deferUpdate();

                const selectedOption = selectInteraction.values[0];

                try {
                    switch (selectedOption) {
                        case 'name_template':
                            await handleNameTemplateChange(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                        case 'user_limit':
                            await handleUserLimitChange(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                        case 'bitrate':
                            await handleBitrateChange(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                        case 'remove_trigger':
                            await handleRemoveTrigger(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                        case 'view_settings':
                            await handleViewSettings(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                    }
                } catch (error) {
                    const errorMessage = error instanceof LughxBotError 
                        ? error.userMessage || 'Đã xảy ra lỗi khi xử lý lựa chọn của bạn.'
                        : 'Đã xảy ra lỗi khi xử lý lựa chọn của bạn.';
                        
                    await selectInteraction.followUp({
                        embeds: [errorEmbed('Lỗi cấu hình', errorMessage)],
                        flags: MessageFlags.Ephemeral,
                    }).catch(() => {});
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    const disabledRow = new ActionRowBuilder().addComponents(
                        selectMenu.setDisabled(true)
                    );
                    await InteractionHelper.safeEditReply(interaction, {
                        components: [disabledRow],
                    }).catch(() => {});
                }
            });
        } catch (error) {
            if (error instanceof LughxBotError) throw error;
            logger.error('Lỗi bất ngờ trong config_setup:', error);
            throw new LughxBotError(
                `Thiết lập cấu hình thất bại: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Không thể cấu hình hệ thống Join to Create.'
            );
        }
    }
};

// --- Các hàm xử lý (handle functions) ---

async function handleNameTemplateChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('📝 Cấu hình Mẫu tên kênh')
        .setDescription('Vui lòng nhập mẫu tên kênh mới.')
        .addFields(
            {
                name: 'Biến có sẵn',
                value: '• `{username}` - Tên người dùng\n• `{display_name}` - Tên hiển thị\n• `{user_tag}` - Thẻ người dùng\n• `{guild_name}` - Tên máy chủ',
                inline: false
            },
            {
                name: 'Mẫu hiện tại',
                value: `\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Nhập mẫu mới của bạn vào khung chat bên dưới' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id,
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newTemplate = message.content.trim();
            if (!newTemplate || newTemplate.length > 100) {
                await interaction.followUp({
                    embeds: [errorEmbed('Mẫu không hợp lệ', 'Mẫu phải từ 1 đến 100 ký tự.')],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                nameTemplate: newTemplate
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, { channelOptions });

            await interaction.followUp({
                embeds: [successEmbed('✅ Đã cập nhật mẫu', `Mẫu tên kênh đã được đổi thành \`${newTemplate}\``)],
                flags: MessageFlags.Ephemeral,
            });
            await message.delete().catch(() => {});
        } catch (error) {
            await interaction.followUp({
                embeds: [errorEmbed('Cập nhật thất bại', 'Không thể cập nhật mẫu tên kênh.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

async function handleUserLimitChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('👥 Cấu hình Giới hạn người dùng')
        .setDescription('Nhập giới hạn người dùng mới (0-99, 0 = không giới hạn).')
        .addFields({
            name: 'Giới hạn hiện tại',
            value: `${currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit === 0 ? 'Không giới hạn' : (currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit) + ' người'}`,
            inline: false
        })
        .setColor(getColor('info'))
        .setFooter({ text: 'Nhập giới hạn mới vào khung chat' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        const newLimit = parseInt(message.content.trim());
        if (newLimit < 0 || newLimit > 99) {
            await interaction.followUp({ embeds: [errorEmbed('Giới hạn không hợp lệ', 'Giới hạn phải từ 0 đến 99.')], flags: MessageFlags.Ephemeral });
            return;
        }

        const channelOptions = currentConfig.channelOptions || {};
        channelOptions[triggerChannel.id] = { ...channelOptions[triggerChannel.id], userLimit: newLimit };
        await updateJoinToCreateConfig(client, interaction.guild.id, { channelOptions });

        await interaction.followUp({
            embeds: [successEmbed('✅ Đã cập nhật giới hạn', `Giới hạn người dùng đã đổi thành ${newLimit === 0 ? 'Không giới hạn' : newLimit + ' người'}`)],
            flags: MessageFlags.Ephemeral,
        });
        await message.delete().catch(() => {});
    });
}

async function handleBitrateChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('🎵 Cấu hình Tốc độ bit (Bitrate)')
        .setDescription('Nhập bitrate mới tính bằng kbps (8-384).')
        .addFields(
            {
                name: 'Bitrate hiện tại',
                value: `${(currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                inline: false
            },
            {
                name: 'Giá trị phổ biến',
                value: '• 64 kbps - Chất lượng thường\n• 96 kbps - Chất lượng tốt\n• 128 kbps - Chất lượng cao\n• 256 kbps - Chất lượng rất cao',
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Nhập bitrate mới vào khung chat' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        const newBitrate = parseInt(message.content.trim());
        if (newBitrate < 8 || newBitrate > 384) {
            await interaction.followUp({ embeds: [errorEmbed('Bitrate không hợp lệ', 'Bitrate phải từ 8 đến 384 kbps.')], flags: MessageFlags.Ephemeral });
            return;
        }

        const channelOptions = currentConfig.channelOptions || {};
        channelOptions[triggerChannel.id] = { ...channelOptions[triggerChannel.id], bitrate: newBitrate * 1000 };
        await updateJoinToCreateConfig(client, interaction.guild.id, { channelOptions });

        await interaction.followUp({
            embeds: [successEmbed('✅ Đã cập nhật bitrate', `Bitrate đổi thành ${newBitrate} kbps`)],
            flags: MessageFlags.Ephemeral,
        });
        await message.delete().catch(() => {});
    });
}

async function handleRemoveTrigger(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('⚠️ Xóa Kênh Kích hoạt')
        .setDescription(`Bạn có chắc muốn xóa ${triggerChannel} khỏi hệ thống Join to Create không?`)
        .setColor('#ff6600')
        .setFooter({ text: 'Hành động này không thể hoàn tác' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`confirm_remove_${triggerChannel.id}`).setLabel('Xóa kênh').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`cancel_remove_${triggerChannel.id}`).setLabel('Hủy').setStyle(ButtonStyle.Secondary)
    );

    await interaction.followUp({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id,
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (buttonInteraction) => {
        await buttonInteraction.deferUpdate();
        if (buttonInteraction.customId.startsWith('confirm')) {
            const success = await removeJoinToCreateTrigger(client, interaction.guild.id, triggerChannel.id);
            if (success) {
                await buttonInteraction.followUp({ embeds: [successEmbed('✅ Đã xóa kênh', `${triggerChannel} đã bị gỡ khỏi hệ thống.`)], flags: MessageFlags.Ephemeral });
            } else {
                await buttonInteraction.followUp({ embeds: [errorEmbed('Lỗi xóa', 'Không thể gỡ kênh kích hoạt.')], flags: MessageFlags.Ephemeral });
            }
        } else {
            await buttonInteraction.followUp({ embeds: [successEmbed('✅ Đã hủy', 'Đã hủy thao tác xóa kênh.')], flags: MessageFlags.Ephemeral });
        }
    });
}

async function handleViewSettings(interaction, triggerChannel, currentConfig, client) {
    const channelConfig = currentConfig.channelOptions?.[triggerChannel.id] || {};
    
    const embed = new EmbedBuilder()
        .setTitle('📋 Cài đặt hiện tại')
        .setDescription(`Cấu hình cho ${triggerChannel}`)
        .setColor(getColor('info'))
        .addFields(
            { name: '🎯 Kênh kích hoạt', value: `${triggerChannel} (${triggerChannel.id})`, inline: false },
            { name: '📝 Mẫu tên kênh', value: `\`${channelConfig.nameTemplate || currentConfig.channelNameTemplate}\``, inline: false },
            { name: '👥 Giới hạn người dùng', value: `${channelConfig.userLimit || currentConfig.userLimit === 0 ? 'Không giới hạn' : (channelConfig.userLimit || currentConfig.userLimit) + ' người'}`, inline: true },
            { name: '🎵 Bitrate', value: `${(channelConfig.bitrate || currentConfig.bitrate) / 1000} kbps`, inline: true },
            { name: '📁 Danh mục', value: currentConfig.categoryId ? `<#${currentConfig.categoryId}>` : 'Chưa thiết lập', inline: true },
            { name: '📊 Trạng thái', value: currentConfig.enabled ? '✅ Đã bật' : '❌ Đã tắt', inline: true },
            { name: '🔢 Kênh tạm đang hoạt động', value: Object.keys(currentConfig.temporaryChannels || {}).length.toString(), inline: true }
        )
        .setTimestamp();

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
}