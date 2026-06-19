import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, LughxBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import { setUserLevel, getLevelingConfig } from '../../services/leveling.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('levelset')
    .setDescription('Đặt cấp độ (level) của một thành viên thành một giá trị cụ thể')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Thành viên bạn muốn đặt cấp độ')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('level')
        .setDescription('Cấp độ muốn đặt')
        .setRequired(true)
        .setMinValue(0)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

      const hasPermission = await checkUserPermissions(
        interaction,
        PermissionFlagsBits.ManageGuild,
        'Bạn cần có quyền Quản lý Máy chủ (ManageGuild) để sử dụng lệnh này.'
      );
      if (!hasPermission) return;

      const levelingConfig = await getLevelingConfig(client, interaction.guildId);
      if (!levelingConfig?.enabled) {
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor('#f1c40f')
              .setDescription('Hệ thống cấp độ hiện đang bị tắt trên máy chủ này.')
          ],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const targetUser = interaction.options.getUser('user');
      const newLevel = interaction.options.getInteger('level');

      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) {
        throw new LughxBotError(
          `User ${targetUser.id} not found in this guild`,
          ErrorTypes.USER_INPUT,
          'Thành viên được chỉ định không có trong máy chủ này.'
        );
      }

      const userData = await setUserLevel(client, interaction.guildId, targetUser.id, newLevel);

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          createEmbed({
            title: '✅ Đã Đặt Cấp Độ',
            description: `Đã đặt thành công cấp độ của ${targetUser.tag} thành **${newLevel}**.\n**Tổng XP hiện tại:** ${userData.totalXp}`,
            color: 'success'
          })
        ]
      });

      logger.info(
        `[ADMIN] User ${interaction.user.tag} set ${targetUser.tag}'s level to ${newLevel} in guild ${interaction.guildId}`
      );
    } catch (error) {
      logger.error('LevelSet command error:', error);
      await handleInteractionError(interaction, error, {
        type: 'command',
        commandName: 'levelset'
      });
    }
  }
};