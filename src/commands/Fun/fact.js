import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, LughxBotError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const facts = [
  "Một ngày trên sao Kim dài hơn một năm trên sao Kim.",
  "Cuộc chiến ngắn nhất trong lịch sử là giữa Anh và Zanzibar vào ngày 27 tháng 8 năm 1896. Nó chỉ kéo dài từ 38 đến 45 phút.",
  "Từ 'Strengths' là từ dài nhất trong tiếng Anh chỉ có một nguyên âm.",
  "Bạch tuộc có ba trái tim và máu màu xanh.",
  "Số lượng cây trên Trái đất nhiều hơn số lượng các ngôi sao trong dải Ngân hà.",
  "Tổng trọng lượng của tất cả loài kiến trên Trái đất được cho là tương đương với tổng trọng lượng của tất cả con người.",
];

export default {
    data: new SlashCommandBuilder()
    .setName("fact")
    .setDescription("Chia sẻ một sự thật thú vị ngẫu nhiên."),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      const randomFact = facts[Math.floor(Math.random() * facts.length)];

      const embed = successEmbed("🧠 Bạn có biết?", `💡 **${randomFact}**`);

      await InteractionHelper.safeReply(interaction, { embeds: [embed] });
      logger.debug(`Lệnh fact được thực hiện bởi người dùng ${interaction.user.id} trong máy chủ ${interaction.guildId}`);
    } catch (error) {
      logger.error('Lỗi lệnh fact:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'fact',
        source: 'fact_command'
      });
    }
  },
};