import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    LabelBuilder,
    CheckboxBuilder,
    TextDisplayBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { LughxBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { safeDeferInteraction } from '../../../utils/interactionValidator.js';
import {
    getApplicationSettings,
    saveApplicationSettings,
    getApplicationRoles,
    saveApplicationRoles,
    getApplicationRoleSettings,
    saveApplicationRoleSettings,
    deleteApplicationRoleSettings,
    getApplications,
    deleteApplication,
} from '../../../utils/database.js';

// ─── Embed & Menu Builders ────────────────────────────────────────────────────

function buildDashboardEmbed(settings, roles, guild) {
    const logChannel = settings.logChannelId ? `<#${settings.logChannelId}>` : '`Chưa cấu hình`';
    const managerRoleList =
        settings.managerRoles?.length > 0
            ? settings.managerRoles.map(id => `<@&${id}>`).join(', ')
            : '`Chưa cấu hình`';
    const roleList =
        roles.length > 0
            ? roles.map(r => `<@&${r.roleId}> — ${r.name}`).join('\n')
            : '`Chưa cấu hình role ứng tuyển nào`';
    const questionCount = settings.questions?.length ?? 0;
    const firstQ =
        settings.questions?.[0]
            ? `\`${settings.questions[0].length > 55 ? settings.questions[0].substring(0, 55) + '…' : settings.questions[0]}\``
            : '`Chưa đặt`';

    return new EmbedBuilder()
        .setTitle('📋 Bảng Điều Khiển Đơn Ứng Tuyển')
        .setDescription(`Quản lý cài đặt ứng tuyển cho **${guild.name}**.\nChọn một tuỳ chọn bên dưới để thay đổi cài đặt.`)
        .setColor(getColor('info'))
        .addFields(
            { name: '⚙️ Trạng Thái Hệ Thống', value: settings.enabled ? '✅ Đã bật' : '❌ Đã tắt', inline: true },
            { name: '📢 Kênh Log', value: logChannel, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '🛡️ Role Quản Lý', value: managerRoleList, inline: false },
            { name: '📝 Câu Hỏi', value: `Đã thiết lập ${questionCount} câu — câu đầu: ${firstQ}`, inline: false },
            { name: '🎭 Role Ứng Tuyển', value: roleList, inline: false },
            {
                name: '🗑️ Thời Gian Lưu Trữ Đơn',
                value: `Chờ duyệt: **${settings.pendingApplicationRetentionDays ?? 30} ngày** · Đã duyệt: **${settings.reviewedApplicationRetentionDays ?? 14} ngày**`,
                inline: false,
            },
        )
        .setFooter({ text: 'Bảng điều khiển sẽ đóng sau 15 phút không hoạt động' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${guildId}`)
        .setPlaceholder('Chọn một cài đặt để cấu hình...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Kênh Log')
                .setDescription('Đặt kênh nhận thông báo các đơn ứng tuyển mới')
                .setValue('log_channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Role Quản Lý')
                .setDescription('Thêm/xoá role có quyền quản lý đơn ứng tuyển')
                .setValue('manager_role')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Chỉnh Sửa Câu Hỏi')
                .setDescription('Tuỳ chỉnh các câu hỏi hiển thị trong form ứng tuyển')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Thêm Role Ứng Tuyển')
                .setDescription('Thêm một role để thành viên nộp đơn xin cấp')
                .setValue('role_add')
                .setEmoji('➕'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Xoá Role Ứng Tuyển')
                .setDescription('Xoá một role khỏi danh sách ứng tuyển')
                .setValue('role_remove')
                .setEmoji('➖'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Thời Gian Lưu Trữ')
                .setDescription('Đặt thời gian giữ lại đơn chờ duyệt và đơn đã duyệt')
                .setValue('retention')
                .setEmoji('🗑️'),
        );
}

function buildButtonRow(settings, guildId, disabled = false) {
    const systemOn = settings.enabled === true;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_cfg_toggle_${guildId}`)
            .setLabel('Hệ Thống Ứng Tuyển')
            .setStyle(systemOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setDisabled(disabled),
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function refreshDashboard(rootInteraction, settings, roles, guildId) {
    const selectMenu = buildSelectMenu(guildId);
    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [buildDashboardEmbed(settings, roles, rootInteraction.guild)],
        components: [
            buildButtonRow(settings, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    }).catch(() => {});
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default {
    async execute(interaction, config, client, selectedAppName = null) {
        try {
            const guildId = interaction.guild.id;

            // Defer immediately to prevent Discord interaction timeout
            await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

            const [settings, roles] = await Promise.all([
                getApplicationSettings(client, guildId),
                getApplicationRoles(client, guildId),
            ]);

            // Check if application system is completely unconfigured
            const isCompletelyUnconfigured = 
                !settings.logChannelId && 
                !settings.enabled && 
                (settings.managerRoles?.length ?? 0) === 0 && 
                roles.length === 0;

            if (isCompletelyUnconfigured) {
                throw new LughxBotError(
                    'Hệ thống ứng tuyển chưa được thiết lập',
                    ErrorTypes.CONFIGURATION,
                    'Hệ thống ứng tuyển chưa được cấu hình. Vui lòng chạy lệnh `/app-admin setup` để tạo form ứng tuyển đầu tiên.',
                );
            }

            // If no application roles exist, show global settings to add one
            if (roles.length === 0) {
                await showGlobalDashboard(interaction, settings, roles, guildId, client);
                return;
            }

            // If a specific app was selected via autocomplete, show its dashboard directly
            if (selectedAppName) {
                const selectedRole = roles.find(r => r.name.toLowerCase() === selectedAppName.toLowerCase());
                if (selectedRole) {
                    await showApplicationDashboard(interaction, selectedRole, settings, roles, guildId, client);
                    return;
                }
                // If name doesn't match, fall through
            }

            // Default: Show first application if no selection made
            const defaultRole = roles[0];
            await showApplicationDashboard(interaction, defaultRole, settings, roles, guildId, client);

        } catch (error) {
            if (error instanceof LughxBotError) throw error;
            logger.error('Unexpected error in app_dashboard:', error);
            throw new LughxBotError(
                `Lỗi tải bảng điều khiển: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Không thể mở bảng điều khiển hệ thống ứng tuyển.',
            );
        }
    },
};

// ─── Application Selector (for multiple applications) ──────────────────────────

async function showApplicationSelector(interaction, roles, settings, guildId, client) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`app_select_${guildId}`)
        .setPlaceholder('Chọn một form ứng tuyển để cấu hình...')
        .addOptions(
            roles.map(role =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(role.name)
                    .setDescription(`Cấu hình hệ thống ứng tuyển cho role ${role.name}`)
                    .setValue(role.roleId)
                    .setEmoji('📋'),
            ),
        );

    const embed = new EmbedBuilder()
        .setTitle('🎯 Chọn Form Ứng Tuyển')
        .setDescription('Vui lòng chọn role ứng tuyển mà bạn muốn cấu hình.')
        .setColor(getColor('info'));

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(selectMenu)],
    });

    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === interaction.user.id && i.customId === `app_select_${guildId}`,
        time: 600_000,
        max: 1,
    });

    collector.on('collect', async selectInteraction => {
        const deferred = await safeDeferInteraction(selectInteraction);
        if (!deferred) return;
        
        const selectedRoleId = selectInteraction.values[0];
        const selectedRole = roles.find(r => r.roleId === selectedRoleId);

        if (selectedRole) {
            await showApplicationDashboard(interaction, selectedRole, settings, roles, guildId, client);
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Hết Giờ', 'Chưa có lựa chọn nào được đưa ra. Bảng điều khiển đã đóng.')],
                components: [],
            }).catch(() => {});
        }
    });
}

// ─── Global Dashboard ──────────────────────────────────────────────────────────

async function showGlobalDashboard(interaction, settings, roles, guildId, client) {
    const selectMenu = buildSelectMenu(guildId);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [buildDashboardEmbed(settings, roles, interaction.guild)],
        components: [
            buildButtonRow(settings, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    });

    setupCollectors(interaction, settings, roles, guildId, client, null);
}

// ─── Application-Specific Dashboard ────────────────────────────────────────────

async function showApplicationDashboard(rootInteraction, selectedRole, settings, roles, guildId, client) {
    const roleObj = rootInteraction.guild.roles.cache.get(selectedRole.roleId);
    
    // Get application-specific settings
    const appSettings = await getApplicationRoleSettings(client, guildId, selectedRole.roleId);
    const questions = appSettings.questions || settings.questions || [];
    const appLogChannelId = appSettings.logChannelId || settings.logChannelId;
    const isEnabled = selectedRole.enabled !== false; // Default to true if not specified

    // Build comprehensive embed
    const logChannelDisplay = appLogChannelId 
        ? `<#${appLogChannelId}>` 
        : '`Kế thừa kênh log chung`';
    
    const questionsDisplay = questions.length > 0
        ? questions.map((q, i) => `${i + 1}. \`${q.length > 60 ? q.substring(0, 60) + '…' : q}\``).join('\n')
        : '`Kế thừa bộ câu hỏi chung`';
    
    const managerRolesDisplay = settings.managerRoles && settings.managerRoles.length > 0
        ? settings.managerRoles.map(id => `<@&${id}>`).join(', ')
        : '`Chưa cấu hình`';

    const embed = new EmbedBuilder()
        .setTitle('🎭 Bảng Điều Khiển Form Ứng Tuyển')
        .setDescription(`Đang cấu hình cho **${selectedRole.name}**`)
        .setColor(isEnabled ? getColor('success') : getColor('error'))
        .addFields(
            { 
                name: '🎭 Role', 
                value: roleObj ? roleObj.toString() : `<@&${selectedRole.roleId}>`, 
                inline: true 
            },
            { 
                name: '⚙️ Trạng Thái', 
                value: isEnabled ? '✅ **Đã bật**' : '❌ **Đã tắt**', 
                inline: true 
            },
            { name: '\u200B', value: '\u200B', inline: true },
            { 
                name: '📝 Câu Hỏi', 
                value: questionsDisplay,
                inline: false 
            },
            { 
                name: '📢 Kênh Log', 
                value: logChannelDisplay,
                inline: true 
            },
            { 
                name: '🛡️ Role Quản Lý',
                value: managerRolesDisplay,
                inline: true 
            },
            { 
                name: '🗑️ Thời Gian Lưu Trữ Đơn',
                value: `Chờ duyệt: **${settings.pendingApplicationRetentionDays ?? 30} ngày** · Đã duyệt: **${settings.reviewedApplicationRetentionDays ?? 14} ngày**`,
                inline: false 
            },
        )
        .setFooter({ text: 'Bảng điều khiển sẽ đóng sau 10 phút không hoạt động' })
        .setTimestamp();

    // Create dropdown button with customization options
    const configMenu = buildApplicationSelectMenu(guildId, selectedRole.roleId);

    // Create control buttons
    const controlButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_toggle_${selectedRole.roleId}`)
            .setLabel(isEnabled ? 'Tắt Form Ứng Tuyển' : 'Bật Form Ứng Tuyển')
            .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`app_delete_${selectedRole.roleId}`)
            .setLabel('Xoá Form Ứng Tuyển')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
    );

    const menuRow = new ActionRowBuilder().addComponents(configMenu);

    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [embed],
        components: [menuRow, controlButtons],
    });

    setupCollectors(rootInteraction, settings, roles, guildId, client, selectedRole.roleId);
}

// ─── Collector Setup ──────────────────────────────────────────────────────────

function setupCollectors(interaction, settings, roles, guildId, client, selectedRoleId) {
    const customIdPrefix = selectedRoleId ? `app_cfg_${selectedRoleId}` : `app_cfg_${guildId}`;
    
    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === interaction.user.id && 
            (selectedRoleId 
                ? i.customId === customIdPrefix
                : (i.customId === `app_cfg_${guildId}` || i.customId === `app_select_${guildId}`)),
        time: 600_000,
    });

    collector.on('collect', async selectInteraction => {
        const selectedOption = selectInteraction.values[0];
        try {
            // Catch expired interactions
            if (!selectInteraction.isStringSelectMenu()) {
                return;
            }
            switch (selectedOption) {
                case 'log_channel':
                    await handleLogChannel(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
                case 'manager_role':
                    await handleManagerRole(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
                case 'questions':
                    await handleQuestions(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
                case 'role_add':
                    await handleRoleAdd(selectInteraction, interaction, settings, roles, guildId, client);
                    break;
                case 'role_remove':
                    await handleRoleRemove(selectInteraction, interaction, settings, roles, guildId, client);
                    break;
                case 'retention':
                    await handleRetention(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
            }
        } catch (error) {
            if (error instanceof LughxBotError) {
                logger.debug(`Applications config validation error: ${error.message}`);
            } else {
                logger.error('Unexpected applications dashboard error:', error);
            }

            const errorMessage =
                error instanceof LughxBotError
                    ? error.userMessage || 'Đã xảy ra lỗi khi xử lý lựa chọn của bạn.'
                    : 'Đã xảy ra lỗi không xác định khi cập nhật cấu hình.';

            if (!selectInteraction.replied && !selectInteraction.deferred) {
                await safeDeferInteraction(selectInteraction);
            }

            await selectInteraction
                .followUp({
                    embeds: [errorEmbed('Lỗi Cấu Hình', errorMessage)],
                    flags: MessageFlags.Ephemeral,
                })
                .catch(() => {});
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('\u23f0 Bảng Điều Khiển Hết Giờ')
                .setDescription('Bảng điều khiển này đã đóng do không hoạt động. Vui lòng chạy lại lệnh để tiếp tục.')
                .setColor(getColor('error'));
                
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [timeoutEmbed],
                components: [],
            }).catch(() => {});
        }
    });

    // ── Global Toggle Button Collector ──────────────────────────────────────────
    if (!selectedRoleId) {
        const globalToggleCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_cfg_toggle_${guildId}`,
            time: 600_000,
        });

        globalToggleCollector.on('collect', async toggleInteraction => {
            const deferred = await safeDeferInteraction(toggleInteraction);
            if (!deferred) return;
            
            try {
                const wasEnabled = settings.enabled === true;
                settings.enabled = !wasEnabled;

                // Save the updated settings
                await saveApplicationSettings(interaction.client, guildId, settings);

                // Refresh dashboard to show new status
                const updatedSettings = await getApplicationSettings(interaction.client, guildId);
                const updatedRoles = await getApplicationRoles(interaction.client, guildId);
                await showGlobalDashboard(interaction, updatedSettings, updatedRoles, guildId, interaction.client);

                await toggleInteraction.followUp({
                    embeds: [successEmbed(
                        wasEnabled ? '🔴 Đã Tắt Hệ Thống Ứng Tuyển' : '🟢 Đã Bật Hệ Thống Ứng Tuyển',
                        `Hệ thống ứng tuyển hiện đã được **${wasEnabled ? 'tắt' : 'bật'}**.\n\n${
                            wasEnabled 
                                ? 'Thành viên sẽ không thể nộp đơn xin cấp role nữa.' 
                                : 'Thành viên hiện có thể bắt đầu nộp đơn xin role.'
                        }`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });

            } catch (error) {
                logger.error('Error toggling global application status:', error);
                await toggleInteraction.followUp({
                    embeds: [errorEmbed('Lỗi', 'Đã xảy ra lỗi khi cố gắng bật/tắt trạng thái ứng tuyển.')],
                    flags: MessageFlags.Ephemeral,
                });
            }
        });

        globalToggleCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏱️ Hết Giờ Cấu Hình')
                    .setDescription('Phiên cấu hình này đã hết giờ do không hoạt động (10 phút).\n\nĐể tiếp tục cấu hình, vui lòng chạy lại lệnh.')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });
    }

    // ── Delete Button Collector (for application-specific dashboard) ──────────────
    if (selectedRoleId) {
        const btnCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_delete_${selectedRoleId}`,
            time: 600_000,
        });

        btnCollector.on('collect', async btnInteraction => {
            // Show confirmation modal
            const appRoleForDelete = roles.find(r => r.roleId === selectedRoleId);
            const appNameForDelete = appRoleForDelete?.name ?? 'form ứng tuyển này';

            const confirmModal = new ModalBuilder()
                .setCustomId('app_delete_confirm')
                .setTitle('Xác Nhận Xoá Form Ứng Tuyển');

            const deleteWarningText = new TextDisplayBuilder()
                .setContent(`⚠️ Bạn sắp xoá vĩnh viễn **${appNameForDelete}**. Tất cả các đơn đã lưu và cài đặt cho role này sẽ bị xoá và không thể khôi phục.`);

            const deleteCheckbox = new CheckboxBuilder()
                .setCustomId('confirm_delete')
                .setDefault(false);

            const deleteCheckboxLabel = new LabelBuilder()
                .setLabel('Tôi xác nhận — hành động này không thể hoàn tác')
                .setCheckboxComponent(deleteCheckbox);

            confirmModal
                .addTextDisplayComponents(deleteWarningText)
                .addLabelComponents(deleteCheckboxLabel);

            try {
                await btnInteraction.showModal(confirmModal);
            } catch (error) {
                logger.error('Error showing delete confirmation modal:', error);
                await btnInteraction.followUp({
                    embeds: [errorEmbed('Lỗi', 'Không thể hiển thị bảng xác nhận. Vui lòng thử lại.')],
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
                return;
            }

            try {
                const confirmSubmit = await btnInteraction.awaitModalSubmit({
                    time: 60_000,
                    filter: i =>
                        i.customId === 'app_delete_confirm' && i.user.id === btnInteraction.user.id,
                }).catch(() => null);

                if (!confirmSubmit) {
                    await btnInteraction.followUp({
                        embeds: [errorEmbed('Đã Huỷ', 'Thao tác xoá form ứng tuyển đã bị huỷ.')],
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const confirmed = confirmSubmit.fields.getCheckbox('confirm_delete');
                if (!confirmed) {
                    await confirmSubmit.reply({
                        embeds: [errorEmbed('Chưa Xác Nhận', 'Bạn phải đánh dấu vào ô xác nhận để xoá form ứng tuyển.')],
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                // Delete the application
                await handleDeleteApplication(confirmSubmit, selectedRoleId, guildId, roles, client);
                collector.stop();
                btnCollector.stop();

            } catch (error) {
                logger.error('Error confirming application deletion:', error);
                await btnInteraction.followUp({
                    embeds: [errorEmbed('Lỗi', 'Đã xảy ra lỗi khi đang xoá form ứng tuyển.')],
                    flags: MessageFlags.Ephemeral,
                });
            }
        });

        btnCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏱️ Hết Giờ Cấu Hình')
                    .setDescription('Phiên cấu hình này đã hết giờ do không hoạt động (10 phút).\n\nĐể tiếp tục cấu hình, vui lòng chạy lại lệnh.')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });

        // ── Toggle Enable/Disable Button Collector ──────────────────────────────
        const toggleCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_toggle_${selectedRoleId}`,
            time: 900_000,
        });

        toggleCollector.on('collect', async toggleInteraction => {
            const deferred = await safeDeferInteraction(toggleInteraction);
            if (!deferred) return;
            
            try {
                // Find and toggle the role
                const roleIndex = roles.findIndex(r => r.roleId === selectedRoleId);
                if (roleIndex === -1) {
                    await toggleInteraction.followUp({
                        embeds: [errorEmbed('Không Tìm Thấy', 'Không tìm thấy role ứng tuyển.')],
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const wasEnabled = roles[roleIndex].enabled !== false;
                roles[roleIndex].enabled = !wasEnabled;

                // Save the updated roles
                await saveApplicationRoles(interaction.client, guildId, roles);

                // Refresh dashboard to show new status
                const updatedRole = roles[roleIndex];
                const updatedSettings = await getApplicationSettings(interaction.client, guildId);
                await showApplicationDashboard(interaction, updatedRole, updatedSettings, roles, guildId, interaction.client);

                await toggleInteraction.followUp({
                    embeds: [successEmbed(
                        wasEnabled ? '🔴 Đã Tắt Form Ứng Tuyển' : '🟢 Đã Bật Form Ứng Tuyển',
                        `Form ứng tuyển **${updatedRole.name}** hiện đã được **${wasEnabled ? 'tắt' : 'bật'}**.\n\n${
                            wasEnabled 
                                ? 'Form này sẽ không còn xuất hiện trong tuỳ chọn của lệnh `/apply submit` nữa.' 
                                : 'Form này giờ sẽ xuất hiện trong tuỳ chọn của lệnh `/apply submit`.'
                        }`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });

            } catch (error) {
                logger.error('Error toggling application status:', error);
                await toggleInteraction.followUp({
                    embeds: [errorEmbed('Lỗi', 'Đã xảy ra lỗi khi bật/tắt trạng thái của form ứng tuyển.')],
                    flags: MessageFlags.Ephemeral,
                });
            }
        });

        toggleCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏱️ Hết Giờ Cấu Hình')
                    .setDescription('Phiên cấu hình này đã hết giờ do không hoạt động (10 phút).\n\nĐể tiếp tục cấu hình, vui lòng chạy lại lệnh.')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });
    }
}

// ─── Build Select Menus ────────────────────────────────────────────────────────

function buildApplicationSelectMenu(guildId, roleId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${roleId}`)
        .setPlaceholder('Chọn một cài đặt để cấu hình...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Kênh Log')
                .setDescription('Đặt kênh nhận thông báo đơn ứng tuyển mới')
                .setValue('log_channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Role Quản Lý')
                .setDescription('Thêm hoặc xoá role có quyền quản lý đơn')
                .setValue('manager_role')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Chỉnh Sửa Câu Hỏi')
                .setDescription('Tuỳ chỉnh các câu hỏi hiển thị trong form ứng tuyển')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Thời Gian Lưu Trữ')
                .setDescription('Thiết lập thời gian lưu giữ lại các đơn ứng tuyển')
                .setValue('retention')
                .setEmoji('🗑️'),
        );
}

// ─── Log Channel ──────────────────────────────────────────────────────────────

async function handleLogChannel(selectInteraction, rootInteraction, settings, roles, guildId, client, selectedRoleId) {
    let currentChannel = settings.logChannelId;
    if (selectedRoleId) {
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        currentChannel = roleSettings.logChannelId || settings.logChannelId;
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_log_channel_modal_${guildId}_${selectedRoleId || 'global'}`)
        .setTitle('📢 Cấu Hình Kênh Log');

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('log_channel')
        .setPlaceholder('Chọn một kênh văn bản...')
        .setMinValues(1)
        .setMaxValues(1)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true);

    const channelLabel = new LabelBuilder()
        .setLabel('Kênh Nhật Ký (Log)')
        .setDescription('Kênh để gửi thông báo khi có đơn ứng tuyển mới')
        .setChannelSelectMenuComponent(channelSelect);

    modal.addLabelComponents(channelLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_log_channel_modal_${guildId}_${selectedRoleId || 'global'}`,
        });

        const channelId = modalSubmission.fields.getField('log_channel').values[0];
        const channel = selectInteraction.guild.channels.cache.get(channelId);

        if (selectedRoleId) {
            const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
            roleSettings.logChannelId = channelId;
            await saveApplicationRoleSettings(client, guildId, selectedRoleId, roleSettings);
        } else {
            settings.logChannelId = channelId;
            await saveApplicationSettings(client, guildId, settings);
        }

        await modalSubmission.reply({
            embeds: [successEmbed('✅ Đã Cập Nhật Kênh Log', `Nhật ký ứng tuyển giờ sẽ được gửi vào kênh ${channel ?? `<#${channelId}>`}.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in log channel modal:', error);
        await selectInteraction.followUp({
            embeds: [errorEmbed('Đã xảy ra lỗi khi đang cập nhật kênh log.')],
            flags: MessageFlags.Ephemeral,
        });
    }
}

// ─── Manager Role ─────────────────────────────────────────────────────────────

async function handleManagerRole(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_manager_role_modal_${guildId}`)
        .setTitle('🛡️ Cấu Hình Role Quản Lý');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('manager_roles')
        .setPlaceholder('Chọn các role để cấp quyền quản lý...')
        .setMinValues(1)
        .setMaxValues(5)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Role Quản Lý')
        .setDescription('Các role được chọn sẽ được bật/tắt quyền quản lý')
        .setRoleSelectMenuComponent(roleSelect);

    modal.addLabelComponents(roleLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_manager_role_modal_${guildId}`,
        });

        const selectedRoleIds = modalSubmission.fields.getField('manager_roles').values;
        const roleSet = new Set(settings.managerRoles ?? []);

        for (const roleId of selectedRoleIds) {
            if (roleSet.has(roleId)) {
                roleSet.delete(roleId);
            } else {
                roleSet.add(roleId);
            }
        }

        settings.managerRoles = Array.from(roleSet);
        await saveApplicationSettings(client, guildId, settings);

        const finalList = settings.managerRoles.length > 0
            ? settings.managerRoles.map(id => `<@&${id}>`).join(', ')
            : '`Không có`';

        await modalSubmission.reply({
            embeds: [successEmbed('✅ Đã Cập Nhật Role Quản Lý', `Role quản lý hiện tại: ${finalList}`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in manager role modal:', error);
        await selectInteraction.followUp({
            embeds: [errorEmbed('Đã xảy ra lỗi khi cập nhật role quản lý.')],
            flags: MessageFlags.Ephemeral,
        });
    }
}

// ─── Edit Questions ───────────────────────────────────────────────────────────

async function handleQuestions(selectInteraction, rootInteraction, settings, roles, guildId, client, selectedRoleId) {
    let currentQuestions = settings.questions ?? [];
    
    if (selectedRoleId) {
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        currentQuestions = roleSettings.questions ?? currentQuestions;
    }

    const modal = new ModalBuilder()
        .setCustomId('app_cfg_questions')
        .setTitle('Chỉnh Sửa Câu Hỏi Ứng Tuyển')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q1')
                    .setLabel('Câu hỏi 1 (Bắt buộc)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[0] ?? '')
                    .setMaxLength(100)
                    .setMinLength(1)
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q2')
                    .setLabel('Câu hỏi 2 (Không bắt buộc)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[1] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q3')
                    .setLabel('Câu hỏi 3 (Không bắt buộc)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[2] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q4')
                    .setLabel('Câu hỏi 4 (Không bắt buộc)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[3] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q5')
                    .setLabel('Câu hỏi 5 (Không bắt buộc)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[4] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'app_cfg_questions' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newQuestions = ['q1', 'q2', 'q3', 'q4', 'q5']
        .map(key => submitted.fields.getTextInputValue(key).trim())
        .filter(Boolean);

    if (newQuestions.length === 0) {
        await submitted.reply({
            embeds: [errorEmbed('Không Có Câu Hỏi', 'Bắt buộc phải có ít nhất một câu hỏi.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (selectedRoleId) {
        // Save per-application questions
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        roleSettings.questions = newQuestions;
        await saveApplicationRoleSettings(client, guildId, selectedRoleId, roleSettings);
    } else {
        // Save global questions
        settings.questions = newQuestions;
        await saveApplicationSettings(client, guildId, settings);
    }

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Đã Cập Nhật Câu Hỏi',
                `Đã lưu ${newQuestions.length} câu hỏi.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, settings, roles, guildId);
}

// ─── Add Application Role ─────────────────────────────────────────────────────

async function handleRoleAdd(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_role_add_modal_${guildId}`)
        .setTitle('➕ Thêm Role Ứng Tuyển');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('application_role')
        .setPlaceholder('Chọn role mà thành viên có thể nộp đơn xin cấp...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Role Ứng Tuyển')
        .setDescription('Chọn role Discord mà thành viên sẽ nộp đơn xin cấp')
        .setRoleSelectMenuComponent(roleSelect);

    const nameInput = new TextInputBuilder()
        .setCustomId('role_name')
        .setLabel('Tên hiển thị (để trống nếu dùng tên gốc của role)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(50)
        .setRequired(false);

    modal.addLabelComponents(roleLabel);
    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_role_add_modal_${guildId}`,
        });

        const roleId = modalSubmission.fields.getField('application_role').values[0];
        const role = selectInteraction.guild.roles.cache.get(roleId);
        const customName = modalSubmission.fields.getTextInputValue('role_name').trim() || role?.name || roleId;

        if (roles.some(r => r.roleId === roleId)) {
            await modalSubmission.reply({
                embeds: [errorEmbed('Đã Tồn Tại', `${role ?? roleId} đã là một role ứng tuyển rồi.`)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        roles.push({ roleId, name: customName });
        await saveApplicationRoles(client, guildId, roles);

        await modalSubmission.reply({
            embeds: [successEmbed('✅ Đã Thêm Role', `Đã thêm ${role ?? roleId} với tên hiển thị là **${customName}**`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in role add modal:', error);
        await selectInteraction.followUp({
            embeds: [errorEmbed('Đã xảy ra lỗi khi thêm role ứng tuyển.')],
            flags: MessageFlags.Ephemeral,
        });
    }
}

// ─── Remove Application Role ──────────────────────────────────────────────────

async function handleRoleRemove(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    if (roles.length === 0) {
        await selectInteraction.followUp({
            embeds: [errorEmbed('Không Có Role', 'Không có role ứng tuyển nào được cấu hình để xoá.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_role_remove_modal_${guildId}`)
        .setTitle('➖ Xoá Role Ứng Tuyển');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('remove_role')
        .setPlaceholder('Chọn role muốn xoá...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Xoá Role Ứng Tuyển')
        .setDescription('Chọn role muốn xoá khỏi danh sách ứng tuyển')
        .setRoleSelectMenuComponent(roleSelect);

    modal.addLabelComponents(roleLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_role_remove_modal_${guildId}`,
        });

        const roleId = modalSubmission.fields.getField('remove_role').values[0];
        const index = roles.findIndex(r => r.roleId === roleId);

        if (index === -1) {
            await modalSubmission.reply({
                embeds: [errorEmbed('Không Tìm Thấy', `<@&${roleId}> không có trong danh sách role ứng tuyển.`)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        roles.splice(index, 1);
        await saveApplicationRoles(client, guildId, roles);

        await modalSubmission.reply({
            embeds: [successEmbed('✅ Đã Xoá Role', `<@&${roleId}> đã được xoá khỏi danh sách role ứng tuyển.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in role remove modal:', error);
        await selectInteraction.followUp({
            embeds: [errorEmbed('Đã xảy ra lỗi khi xoá role ứng tuyển.')],
            flags: MessageFlags.Ephemeral,
        });
    }
}

// ─── Retention Period ─────────────────────────────────────────────────────────

async function handleRetention(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('app_cfg_retention')
        .setTitle('Thời Gian Lưu Trữ Đơn');

    const retentionInfo = new TextDisplayBuilder()
        .setContent(
            '**Chờ duyệt** — thời gian giữ lại các đơn chưa trả lời/đang xử lý trước khi xoá tự động.\n' +
            '**Đã duyệt** — thời gian giữ lại các đơn đã được chấp nhận hoặc từ chối.\n' +
            '-# Nhập số nguyên từ 1 đến 3650 (tối đa 10 năm).',
        );

    const pendingLabel = new LabelBuilder()
        .setLabel('Thời gian lưu đơn chờ (ngày)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('pending_days')
                .setStyle(TextInputStyle.Short)
                .setValue(String(settings.pendingApplicationRetentionDays ?? 30))
                .setMaxLength(4)
                .setMinLength(1)
                .setRequired(true),
        );

    const reviewedLabel = new LabelBuilder()
        .setLabel('Thời gian lưu đơn đã duyệt (ngày)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('reviewed_days')
                .setStyle(TextInputStyle.Short)
                .setValue(String(settings.reviewedApplicationRetentionDays ?? 14))
                .setMaxLength(4)
                .setMinLength(1)
                .setRequired(true),
        );

    modal
        .addTextDisplayComponents(retentionInfo)
        .addLabelComponents(pendingLabel, reviewedLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'app_cfg_retention' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const pendingDays = parseInt(submitted.fields.getTextInputValue('pending_days').trim(), 10);
    const reviewedDays = parseInt(submitted.fields.getTextInputValue('reviewed_days').trim(), 10);

    if (isNaN(pendingDays) || pendingDays < 1 || pendingDays > 3650) {
        await submitted.reply({
            embeds: [errorEmbed('Giá Trị Không Hợp Lệ', 'Thời gian lưu đơn chờ phải là số nguyên từ **1** đến **3650** ngày.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (isNaN(reviewedDays) || reviewedDays < 1 || reviewedDays > 3650) {
        await submitted.reply({
            embeds: [errorEmbed('Giá Trị Không Hợp Lệ', 'Thời gian lưu đơn đã duyệt phải là số nguyên từ **1** đến **3650** ngày.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    settings.pendingApplicationRetentionDays = pendingDays;
    settings.reviewedApplicationRetentionDays = reviewedDays;
    await saveApplicationSettings(client, guildId, settings);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Đã Cập Nhật Thời Gian Lưu Trữ',
                `Đơn chờ duyệt sẽ được giữ lại trong **${pendingDays} ngày**.\nĐơn đã duyệt sẽ được giữ lại trong **${reviewedDays} ngày**.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, settings, roles, guildId);
}

// ─── Delete Application ───────────────────────────────────────────────────────

async function handleDeleteApplication(confirmSubmit, selectedRoleId, guildId, roles, client) {
    try {
        // Find the application in the roles array
        const roleIndex = roles.findIndex(r => r.roleId === selectedRoleId);
        if (roleIndex === -1) {
            await confirmSubmit.reply({
                embeds: [errorEmbed('Không Tìm Thấy', 'Không tìm thấy role ứng tuyển.')],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const deletedRole = roles[roleIndex];

        // Remove from roles array
        roles.splice(roleIndex, 1);

        // Save updated roles list
        await saveApplicationRoles(client, guildId, roles);

        // Delete per-application settings
        await deleteApplicationRoleSettings(client, guildId, selectedRoleId);

        // Get all applications for this guild and find ones with this roleId
        const allApplications = await getApplications(client, guildId);
        const applicationsToDelete = allApplications.filter(app => app.roleId === selectedRoleId);

        // Delete each application
        for (const app of applicationsToDelete) {
            await deleteApplication(client, guildId, app.id, app.userId);
        }

        // Send success message
        await confirmSubmit.reply({
            embeds: [
                successEmbed(
                    '🗑️ Đã Xoá Form Ứng Tuyển',
                    `Form ứng tuyển cho <@&${selectedRoleId}> (**${deletedRole.name}**) đã bị xoá vĩnh viễn.\n\n` +
                    `Đã xoá: **${applicationsToDelete.length}** đơn ứng tuyển đã nộp`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

    } catch (error) {
        logger.error('Error in handleDeleteApplication:', error);
        await confirmSubmit.reply({
            embeds: [errorEmbed('Lỗi', 'Đã xảy ra lỗi khi xoá form ứng tuyển. Vui lòng thử lại.')],
            flags: MessageFlags.Ephemeral,
        });
    }
}