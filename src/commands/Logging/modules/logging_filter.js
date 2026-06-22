import { PermissionsBitField } from 'discord.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { logEvent } from '../../../utils/moderation.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Từ chối quyền truy cập', 'Bạn cần quyền **Quản trị viên** để quản lý bộ lọc nhật ký.')],
            });
        }

        if (!client.db) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Lỗi cơ sở dữ liệu', 'Cơ sở dữ liệu chưa được khởi tạo.')],
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const type = interaction.options.getString('type');
        const entityId = interaction.options.getString('id');
        const guildId = interaction.guildId;

        const currentConfig = await getGuildConfig(client, guildId);
        if (!currentConfig.logIgnore) {
            currentConfig.logIgnore = { users: [], channels: [] };
        }

        let targetArray;
        let entityType;
        let entityName;

        if (type === 'user') {
            targetArray = currentConfig.logIgnore.users;
            entityType = 'Người dùng';
            const member = await interaction.guild.members.fetch(entityId).catch(() => null);
            entityName = member ? member.user.tag : `ID: ${entityId}`;
        } else if (type === 'channel') {
            targetArray = currentConfig.logIgnore.channels;
            entityType = 'Kênh';
            const channel = interaction.guild.channels.cache.get(entityId);
            entityName = channel ? `#${channel.name}` : `ID: ${entityId}`;
        } else {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Loại không hợp lệ', "Vui lòng chọn `user` (người dùng) hoặc `channel` (kênh).")],
            });
        }

        let successMessage;

        if (subcommand === 'add') {
            if (targetArray.includes(entityId)) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Đã được lọc', `${entityType} **${entityName}** đã có trong danh sách bỏ qua.`)],
                });
            }
            targetArray.push(entityId);
            successMessage = `${entityType} **${entityName}** đã được thêm vào danh sách bỏ qua nhật ký. Các sự kiện từ đối tượng này sẽ không được ghi lại.`;
        } else if (subcommand === 'remove') {
            const index = targetArray.indexOf(entityId);
            if (index === -1) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Chưa được lọc', `${entityType} **${entityName}** không có trong danh sách bỏ qua.`)],
                });
            }
            targetArray.splice(index, 1);
            successMessage = `${entityType} **${entityName}** đã được xóa khỏi danh sách bỏ qua nhật ký. Các sự kiện sẽ bắt đầu được ghi lại từ bây giờ.`;
        } else {
            return;
        }

        try {
            await setGuildConfig(client, guildId, currentConfig);

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: 'Cập nhật bộ lọc nhật ký',
                    target: `Bộ lọc ${subcommand}`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: { entityType, loggingEnabled: currentConfig.enableLogging },
                },
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Cập nhật bộ lọc', successMessage)],
            });
        } catch (error) {
            logger.error('logging filter error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Lỗi cơ sở dữ liệu', 'Không thể lưu thay đổi bộ lọc.')],
            });
        }
    },
};