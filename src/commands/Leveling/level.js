import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { getLevelingConfig, saveLevelingConfig } from '../../services/leveling.js';
import { botHasPermission } from '../../utils/permissionGuard.js';
import { LughxBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import levelDashboard from './modules/level_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('Quản lý hệ thống cấp độ (level)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setup')
                .setDescription('Thiết lập hệ thống cấp độ — lệnh này cũng sẽ kích hoạt hệ thống')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Kênh để gửi thông báo khi thành viên lên cấp')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_min')
                        .setDescription('Số XP tối thiểu nhận được trên mỗi tin nhắn (mặc định: 15)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_max')
                        .setDescription('Số XP tối đa nhận được trên mỗi tin nhắn (mặc định: 25)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addStringOption((option) =>
                    option
                        .setName('message')
                        .setDescription(
                            'Tin nhắn lên cấp. Sử dụng {user} và {level} làm vị trí thay thế (đã có sẵn mặc định)',
                        )
                        .setMaxLength(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_cooldown')
                        .setDescription('Thời gian giãn cách (giây) giữa các lần nhận XP (mặc định: 60)')
                        .setMinValue(0)
                        .setMaxValue(3600)
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('Mở bảng điều khiển tương tác cấu hình hệ thống cấp độ'),
        ),
    category: 'Leveling',

    async execute(interaction, config, client) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction, {
                flags: MessageFlags.Ephemeral,
            });
            if (!deferred) return;

            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            'Thiếu Quyền Hạn',
                            'Bạn cần có quyền **Quản lý Máy chủ** để sử dụng lệnh này.',
                        ),
                    ],
                });
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'dashboard') {
                return levelDashboard.execute(interaction, config, client);
            }

            if (subcommand === 'setup') {
                const channel = interaction.options.getChannel('channel');
                const xpMin = interaction.options.getInteger('xp_min') ?? 15;
                const xpMax = interaction.options.getInteger('xp_max') ?? 25;
                const message =
                    interaction.options.getString('message') ??
                    '{user} đã lên cấp {level}!';
                const xpCooldown = interaction.options.getInteger('xp_cooldown') ?? 60;

                if (xpMin > xpMax) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            errorEmbed(
                                'Khoảng XP Không Hợp Lệ',
                                `XP tối thiểu (**${xpMin}**) không được lớn hơn XP tối đa (**${xpMax}**).`,
                            ),
                        ],
                    });
                }

                if (!botHasPermission(channel, ['SendMessages', 'EmbedLinks'])) {
                    throw new LughxBotError(
                        'Bot missing permissions in the specified channel',
                        ErrorTypes.PERMISSION,
                        `Tôi cần quyền **Gửi tin nhắn** (SendMessages) và **Chèn liên kết** (EmbedLinks) trong kênh ${channel} để gửi thông báo lên cấp.`,
                    );
                }

                const existingConfig = await getLevelingConfig(client, interaction.guildId);

                if (existingConfig.configured) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            errorEmbed(
                                'Hệ Thống Cấp Độ Đã Kích Hoạt',
                                `Hệ thống cấp độ đã được thiết lập trên máy chủ này (thông báo lên cấp được gửi tại <#${existingConfig.levelUpChannel}>).\n\nSử dụng lệnh \`/level dashboard\` để điều chỉnh các cài đặt.`,
                            ),
                        ],
                    });
                }

                const newConfig = {
                    ...existingConfig,
                    configured: true,
                    enabled: true,
                    levelUpChannel: channel.id,
                    xpRange: { min: xpMin, max: xpMax },
                    xpCooldown: xpCooldown,
                    levelUpMessage: message,
                    announceLevelUp: true,
                };

                await saveLevelingConfig(client, interaction.guildId, newConfig);

                logger.info(`Leveling system set up in guild ${interaction.guildId}`, {
                    channelId: channel.id,
                    xpMin,
                    xpMax,
                    xpCooldown,
                    userId: interaction.user.id,
                });

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createEmbed({
                            title: '✅ Thiết Lập Hệ Thống Cấp Độ Thành Công',
                            description:
                                `Hệ thống cấp độ hiện đã được **kích hoạt** và sẵn sàng hoạt động.\n\n` +
                                `**Kênh thông báo:** ${channel}\n` +
                                `**XP mỗi tin nhắn:** ${xpMin} – ${xpMax}\n` +
                                `**Thời gian chờ nhận XP:** ${xpCooldown} giây\n` +
                                `**Tin nhắn lên cấp:** \`${message}\`\n\n` +
                                `Sử dụng lệnh \`/level dashboard\` để điều chỉnh bất kỳ cài đặt nào tại mọi thời điểm.`,
                            color: 'success',
                        }),
                    ],
                });
            }
        } catch (error) {
            logger.error('Level command error:', error);
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'level',
            });
        }
    },
};