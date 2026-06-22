import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, LughxBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { sanitizeInput } from '../../utils/sanitization.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("reverse")
    .setDescription("Viết văn bản của bạn theo chiều ngược lại.")
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("Văn bản muốn đảo ngược.")
        .setRequired(true)
        .setMaxLength(1000),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      const originalText = interaction.options.getString("text");
      
      if (!originalText || originalText.trim().length === 0) {
        throw new LughxBotError(
          'Empty text provided to reverse command',
          ErrorTypes.USER_INPUT,
          'Vui lòng nhập nội dung văn bản để đảo ngược!'
        );
      }
      
      const sanitizedText = sanitizeInput(originalText, 1000);
      const reversedText = sanitizedText.split("").reverse().join("");

      const embed = successEmbed(
        "Văn bản bị đảo ngược",
        `Gốc: **${sanitizedText}**\nĐảo ngược: **${reversedText}**`,
      );

      await InteractionHelper.safeReply(interaction, { embeds: [embed] });
      logger.debug(`Lệnh reverse được thực hiện bởi người dùng ${interaction.user.id} trong máy chủ ${interaction.guildId}`);
    } catch (error) {
      logger.error('Lỗi lệnh reverse:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'reverse',
        source: 'reverse_command'
      });
    }
  },
};