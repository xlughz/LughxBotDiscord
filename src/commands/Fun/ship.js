import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, LughxBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { sanitizeInput } from '../../utils/sanitization.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
function stringToHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export default {
    data: new SlashCommandBuilder()
    .setName("ship")
    .setDescription("Tính toán độ tương hợp giữa hai người.")
    .addStringOption((option) =>
      option
        .setName("name1")
        .setDescription("Tên hoặc người dùng thứ nhất.")
        .setRequired(true)
        .setMaxLength(100),
    )
    .addStringOption((option) =>
      option
        .setName("name2")
        .setDescription("Tên hoặc người dùng thứ hai.")
        .setRequired(true)
        .setMaxLength(100),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

      const name1Raw = interaction.options.getString("name1");
      const name2Raw = interaction.options.getString("name2");

      if (!name1Raw || name1Raw.trim().length === 0 || !name2Raw || name2Raw.trim().length === 0) {
        throw new LughxBotError(
          'Empty names provided to ship command',
          ErrorTypes.USER_INPUT,
          'Vui lòng cung cấp tên hợp lệ cho cả hai người!'
        );
      }

      const name1 = sanitizeInput(name1Raw.trim(), 100);
      const name2 = sanitizeInput(name2Raw.trim(), 100);

      if (name1.toLowerCase() === name2.toLowerCase()) {
        const embed = warningEmbed(
          "💖 Chỉ số tương hợp",
          `**${name1}** không thể ghép đôi với chính mình! Hãy chọn hai người khác nhau nhé.`
        );
        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      const sortedNames = [name1, name2].sort();
      const combination = sortedNames.join("-").toLowerCase();
      const score = stringToHash(combination) % 101;

      let description;
      if (score === 100) {
        description = "Định mệnh! Họ sinh ra là để dành cho nhau!";
      } else if (score >= 80) {
        description = "Một cặp đôi hoàn hảo! Chuẩn bị sẵn sàng cho đám cưới thôi!";
      } else if (score >= 60) {
        description = "Hóa học tuyệt vời. Rất đáng để tiến xa hơn!";
      } else if (score >= 40) {
        description = "Mức độ bạn bè. Cần thêm thời gian để tìm hiểu?";
      } else if (score >= 20) {
        description = "Có vẻ khá khó khăn. Họ cần thêm không gian riêng.";
      } else {
        description = "Không tương hợp chút nào. Chạy ngay đi!";
      }

      const progressBar =
        "█".repeat(Math.floor(score / 10)) +
        "░".repeat(10 - Math.floor(score / 10));

      const embed = successEmbed(
        `💖 Chỉ số tương hợp: ${name1} vs ${name2}`,
        `Độ tương hợp: **${score}%**\n\n\`${progressBar}\`\n\n*${description}*`,
      );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      logger.debug(`Lệnh ship được thực hiện bởi người dùng ${interaction.user.id} trong máy chủ ${interaction.guildId}`);
    } catch (error) {
      logger.error('Lỗi lệnh ship:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'ship',
        source: 'ship_command'
      });
    }
  },
};