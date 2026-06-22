import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, LughxBotError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("flip")
    .setDescription("Tung một đồng xu (Sấp hoặc Ngửa)."),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      const result = Math.random() < 0.5 ? "Sấp" : "Ngửa";
      const emoji = result === "Sấp" ? "🪙" : "🔮";

      const embed = successEmbed(
        "Sấp hay Ngửa?",
        `Đồng xu đã rơi vào mặt... **${result}** ${emoji}!`,
      );

      await InteractionHelper.safeReply(interaction, { embeds: [embed] });
      logger.debug(`Lệnh flip được thực hiện bởi người dùng ${interaction.user.id} trong máy chủ ${interaction.guildId}`);
    } catch (error) {
      logger.error('Lỗi lệnh flip:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'flip',
        source: 'flip_command'
      });
    }
  },
};