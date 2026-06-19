import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, LughxBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getUserLevelData, getLevelingConfig, getXpForLevel } from '../../services/leveling.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Kiểm tra thứ hạng và cấp độ của bạn hoặc của thành viên khác')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Thành viên bạn muốn kiểm tra thứ hạng')
        .setRequired(false)
    )
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

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

      const targetUser = interaction.options.getUser('user') || interaction.user;
      const member = await interaction.guild.members
        .fetch(targetUser.id)
        .catch(() => null);

      if (!member) {
        throw new LughxBotError(
          `User ${targetUser.id} not found in guild`,
          ErrorTypes.USER_INPUT,
          'Không thể tìm thấy thành viên được chỉ định trong máy chủ này.'
        );
      }

      const userData = await getUserLevelData(client, interaction.guildId, targetUser.id);

      const safeUserData = {
        level: userData?.level ?? 0,
        xp: userData?.xp ?? 0,
        totalXp: userData?.totalXp ?? 0
      };

      const xpNeeded = getXpForLevel(safeUserData.level + 1);
      const progress = xpNeeded > 0 ? Math.floor((safeUserData.xp / xpNeeded) * 100) : 0;
      const progressBar = createProgressBar(progress, 20);

      const embed = new EmbedBuilder()
        .setTitle(`Thứ hạng của ${member.displayName}`)
        .setThumbnail(member.displayAvatarURL({ dynamic: true }))
        .addFields(
          {
            name: '📊 Cấp độ',
            value: safeUserData.level.toString(),
            inline: true
          },
          {
            name: '⭐ XP hiện tại',
            value: `${safeUserData.xp}/${xpNeeded}`,
            inline: true
          },
          {
            name: '✨ Tổng XP',
            value: safeUserData.totalXp.toString(),
            inline: true
          },
          {
            name: `Tiến trình đạt Cấp ${safeUserData.level + 1}`,
            value: `${progressBar} ${progress}%`
          }
        )
        .setColor('#2ecc71')
        .setTimestamp();

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      logger.debug(`Rank checked for user ${targetUser.id} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Rank command error:', error);
      await handleInteractionError(interaction, error, {
        type: 'command',
        commandName: 'rank'
      });
    }
  }
};

function createProgressBar(percentage, length = 10) {
  if (percentage < 0 || percentage > 100) {
    percentage = Math.max(0, Math.min(100, percentage));
  }
  const filled = Math.round((percentage / 100) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}