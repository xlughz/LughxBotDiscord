import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import ApplicationService from '../../services/applicationService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { 
    getApplicationSettings, 
    getUserApplications, 
    createApplication, 
    getApplication,
    getApplicationRoles,
    updateApplication,
    getApplicationRoleSettings
} from '../../utils/database.js';

function getApplicationStatusPresentation(statusValue) {
    const normalized = typeof statusValue === 'string' ? statusValue.trim().toLowerCase() : 'unknown';
    const statusLabel =
        normalized === 'pending' ? 'Đang xử lý' :
        normalized === 'approved' ? 'Đã chấp nhận' :
        normalized === 'denied' ? 'Đã từ chối' :
        'Không rõ';
    const statusEmoji =
        normalized === 'pending' ? '🟡' :
        normalized === 'approved' ? '🟢' :
        normalized === 'denied' ? '🔴' :
        '⚪';

    return { normalized, statusLabel, statusEmoji };
}

export default {
    data: new SlashCommandBuilder()
        .setName("apply")
        .setDescription("Quản lý đơn ứng tuyển")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("submit")
                .setDescription("Nộp đơn ứng tuyển cho một vị trí")
                .addStringOption((option) =>
                    option
                        .setName("application")
                        .setDescription("Vị trí bạn muốn ứng tuyển")
                        .setRequired(true)
                        .setAutocomplete(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("status")
                .setDescription("Kiểm tra trạng thái đơn ứng tuyển của bạn")
                .addStringOption((option) =>
                    option
                        .setName("id")
                        .setDescription("ID đơn ứng tuyển (để trống để xem tất cả)")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("list")
                .setDescription("Xem danh sách các vị trí đang tuyển"),
        ),

    category: "Community",

    execute: withErrorHandling(async (interaction) => {
        if (!interaction.inGuild()) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed("Lệnh này chỉ có thể sử dụng trong máy chủ.")],
                flags: ["Ephemeral"],
            });
        }

        const { options, guild, member } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand !== "submit") {
            const isListCommand = subcommand === "list";
            await InteractionHelper.safeDefer(interaction, { flags: isListCommand ? [] : ["Ephemeral"] });
        }

        logger.info(`Apply command executed: ${subcommand}`, {
            userId: interaction.user.id,
            guildId: guild.id,
            subcommand
        });

        const settings = await getApplicationSettings(
            interaction.client,
            guild.id,
        );
        
        if (!settings.enabled) {
            throw createError(
                'Hệ thống ứng tuyển đã tắt',
                ErrorTypes.CONFIGURATION,
                'Hệ thống ứng tuyển hiện đang bị tắt trong máy chủ này.',
                { guildId: guild.id }
            );
        }

        if (subcommand === "submit") {
            await handleSubmit(interaction, settings);
        } else if (subcommand === "status") {
            await handleStatus(interaction);
        } else if (subcommand === "list") {
            await handleList(interaction);
        }
    }, { type: 'command', commandName: 'apply' })
};

export async function handleApplicationModal(interaction) {
    if (!interaction.isModalSubmit()) return;
    
    const customId = interaction.customId;
    if (!customId.startsWith('app_modal_')) return;
    
    const roleId = customId.split('_')[2];
    
    const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
    const applicationRole = applicationRoles.find(appRole => appRole.roleId === roleId);
    
    if (!applicationRole) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Không tìm thấy cấu hình ứng tuyển.')],
            flags: ["Ephemeral"]
        });
    }
    
    const role = interaction.guild.roles.cache.get(roleId);
    
    if (!role) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Không tìm thấy role.')],
            flags: ["Ephemeral"]
        });
    }
    
    const answers = [];
    const settings = await getApplicationSettings(interaction.client, interaction.guild.id);
    
    let questions = settings.questions || ["Tại sao bạn muốn nhận role này?", "Bạn có kinh nghiệm gì không?"];
    const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild.id, roleId);
    if (roleSettings.questions && roleSettings.questions.length > 0) {
        questions = roleSettings.questions;
    }
    
    for (let i = 0; i < questions.length; i++) {
        const answer = interaction.fields.getTextInputValue(`q${i}`);
        answers.push({
            question: questions[i],
            answer: answer
        });
    }
    
    try {
        const application = await ApplicationService.submitApplication(interaction.client, {
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            roleId: roleId,
            roleName: applicationRole.name,
            username: interaction.user.tag,
            avatar: interaction.user.displayAvatarURL(),
            answers: answers
        });
        
        const embed = successEmbed(
            'Đã Nộp Đơn',
            `Đơn ứng tuyển vào vị trí **${applicationRole.name}** của bạn đã được gửi thành công!\n\n` +
            `ID Đơn: \`${application.id}\`\n` +
            `Bạn có thể kiểm tra trạng thái với lệnh \`/apply status id:${application.id}\``
        );
        
        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
        
        const settings = await getApplicationSettings(interaction.client, interaction.guild.id);
        const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild.id, roleId);
        
        const logChannelId = roleSettings.logChannelId || settings.logChannelId;
        
        if (logChannelId) {
            const logChannel = interaction.guild.channels.cache.get(logChannelId);
            if (logChannel) {
                const logEmbed = createEmbed({
                    title: '📝 Đơn Ứng Tuyển Mới',
                    description: `**Người dùng:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
                        `**Vị trí:** ${applicationRole.name}\n` +
                        `**Role:** ${role.name}\n` +
                        `**ID Đơn:** \`${application.id}\`\n` +
                        `**Trạng thái:** 🟡 Đang xử lý`
                }).setColor(getColor('warning'));
                
                const logMessage = await logChannel.send({ embeds: [logEmbed] });
                
                await updateApplication(interaction.client, interaction.guild.id, application.id, {
                    logMessageId: logMessage.id,
                    logChannelId: logChannelId
                });
            }
        }
        
    } catch (error) {
        logger.error('Error creating application:', {
            error: error.message,
            userId: interaction.user.id,
            guildId: interaction.guild.id,
            roleId,
            stack: error.stack
        });
        
        await handleInteractionError(interaction, error, {
            type: 'modal',
            handler: 'application_submission'
        });
    }
}

async function handleList(interaction) {
    try {
        const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
        
        if (applicationRoles.length === 0) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Hiện không có đơn ứng tuyển nào khả dụng.")],
            });
        }

        const embed = createEmbed({
            title: "Danh Sách Ứng Tuyển",
            description: "Các vị trí bạn có thể ứng tuyển:"
        });

        applicationRoles.forEach((appRole, index) => {
            const role = interaction.guild.roles.cache.get(appRole.roleId);
            embed.addFields({
                name: `${index + 1}. ${appRole.name}`,
                value: `**Role:** ${role ? `<@&${appRole.roleId}>` : 'Không tìm thấy role'}\n` +
                       `**Ứng tuyển với:** \`/apply submit application:"${appRole.name}"\``,
                inline: false
            });
        });

        embed.setFooter({
            text: "Dùng /apply submit application:<tên> để nộp đơn."
        });

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
        logger.error('Error listing applications:', {
            error: error.message,
            guildId: interaction.guild.id,
            stack: error.stack
        });
        
        throw createError(
            'Lỗi tải danh sách ứng tuyển',
            ErrorTypes.DATABASE,
            'Không thể tải danh sách ứng tuyển. Vui lòng thử lại sau.',
            { guildId: interaction.guild.id }
        );
    }
}

async function handleSubmit(interaction, settings) {
    const applicationName = interaction.options.getString("application");
    const member = interaction.member;

    const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
    
    const applicationRole = applicationRoles.find(appRole => 
        appRole.name.toLowerCase() === applicationName.toLowerCase()
    );

    if (!applicationRole) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                errorEmbed(
                    "Không tìm thấy đơn ứng tuyển.",
                    "Sử dụng `/apply list` để xem các vị trí đang tuyển."
                ),
            ],
            flags: ["Ephemeral"],
        });
    }

    const userApps = await getUserApplications(
        interaction.client,
        interaction.guild.id,
        interaction.user.id,
    );
    const pendingApp = userApps.find((app) => app.status === "pending");

    if (pendingApp) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                errorEmbed(
                    `Bạn đã có một đơn ứng tuyển đang chờ xử lý. Vui lòng đợi kết quả.`,
                ),
            ],
            flags: ["Ephemeral"],
        });
    }

    const role = interaction.guild.roles.cache.get(applicationRole.roleId);
    if (!role) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Role của đơn ứng tuyển này không còn tồn tại.')],
            flags: ["Ephemeral"]
        });
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_modal_${applicationRole.roleId}`)
        .setTitle(`Ứng tuyển vào ${applicationRole.name}`);

    let questions = settings.questions || ["Tại sao bạn muốn nhận role này?", "Bạn có kinh nghiệm gì không?"];
    const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild.id, applicationRole.roleId);
    if (roleSettings.questions && roleSettings.questions.length > 0) {
        questions = roleSettings.questions;
    }

    questions.forEach((question, index) => {
        const input = new TextInputBuilder()
            .setCustomId(`q${index}`)
            .setLabel(
                question.length > 45
                    ? `${question.substring(0, 42)}...`
                    : question,
            )
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);
    });

    await interaction.showModal(modal);
}

async function handleStatus(interaction) {
    const appId = interaction.options.getString("id");

    if (appId) {
        const application = await getApplication(
            interaction.client,
            interaction.guild.id,
            appId,
        );

        if (!application || application.userId !== interaction.user.id) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Không tìm thấy đơn hoặc bạn không có quyền xem đơn này.",
                    ),
                ],
                flags: ["Ephemeral"],
            });
        }

        const submittedAt = application?.createdAt ? new Date(application.createdAt) : null;
        const submittedAtDisplay = submittedAt && !Number.isNaN(submittedAt.getTime())
            ? submittedAt.toLocaleString()
            : 'Ngày không xác định';
        const statusView = getApplicationStatusPresentation(application.status);
        const embed = createEmbed({
            title: `Đơn #${application.id} - ${application.roleName || 'Vị trí không xác định'}`,
            description:
                `**ID Đơn:** \`${application.id}\`\n` +
                `**Trạng thái:** ${statusView.statusEmoji} ${statusView.statusLabel}\n` +
                `**Ngày nộp:** ${submittedAtDisplay}`
        });

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
    } else {
        const applications = await getUserApplications(
            interaction.client,
            interaction.guild.id,
            interaction.user.id,
        );

        if (applications.length === 0) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed("Bạn chưa nộp đơn ứng tuyển nào."),
                ],
                flags: ["Ephemeral"],
            });
        }

        const recentApplications = applications
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
            .slice(0, 10);

        const embed = createEmbed({
            title: "Đơn Ứng Tuyển Của Bạn",
            description: `Đang hiển thị ${recentApplications.length} đơn gần nhất.`
        });

        recentApplications.forEach((application) => {
            const submittedAt = application?.createdAt ? new Date(application.createdAt) : null;
            const submittedAtDisplay = submittedAt && !Number.isNaN(submittedAt.getTime())
                ? submittedAt.toLocaleDateString()
                : 'Ngày không xác định';
            const statusView = getApplicationStatusPresentation(application.status);

            embed.addFields({
                name: `${statusView.statusEmoji} ${application.roleName || 'Vị trí không xác định'} (${statusView.statusLabel})`,
                value:
                    `**ID:** \`${application.id}\`\n` +
                    `**Trạng thái:** ${statusView.statusEmoji} ${statusView.statusLabel}\n` +
                    `**Ngày nộp:** ${submittedAtDisplay}`,
                inline: true,
            });
        });

        if (applications.length > recentApplications.length) {
            embed.setFooter({ text: `Đang hiển thị ${recentApplications.length} trong tổng số ${applications.length} đơn.` });
        }

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
    }
}