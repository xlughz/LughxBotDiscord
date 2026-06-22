import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const EMBED_DESCRIPTION_LIMIT = 4096;

export default {
    data: new SlashCommandBuilder()
    .setName("fight")
    .setDescription("Bắt đầu một trận đấu giả lập 1v1.")
    .addUserOption((option) =>
      option
        .setName("opponent")
        .setDescription("Người bạn muốn thách đấu.")
        .setRequired(true),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

      const challenger = interaction.user;
      const opponent = interaction.options.getUser("opponent");

      // Kiểm tra tự thách đấu
      if (challenger.id === opponent.id) {
        const embed = warningEmbed(
          `**${challenger.username}**, bạn không thể tự chiến đấu với chính mình! Trận đấu đã kết thúc trước khi kịp bắt đầu.`,
          "⚔️ Thách đấu không hợp lệ"
        );
        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      // Kiểm tra đấu với bot
      if (opponent.bot) {
        const embed = warningEmbed(
          "Bạn không thể chiến đấu với bot! Hãy thách đấu một người thực sự nhé.",
          "⚔️ Đối thủ không hợp lệ"
        );
        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      const winner = rand(0, 1) === 0 ? challenger : opponent;
      const loser = winner.id === challenger.id ? opponent : challenger;
      const rounds = rand(3, 7);
      const damage = rand(10, 50);

      const log = [];
      log.push(
        `💥 **${challenger.username}** thách đấu **${opponent.username}** trong một trận quyết đấu! (Đấu ${rounds} hiệp)`,
      );

      for (let i = 1; i <= rounds; i++) {
        const attacker = rand(0, 1) === 0 ? challenger : opponent;
        const target = attacker.id === challenger.id ? opponent : challenger;
        const action = [
          "tung một cú đấm đầy uy lực",
          "thực hiện một đòn đánh chí mạng",
          "tung một chiêu thức yếu ớt",
          "đỡ đòn và phản công ngay lập tức",
        ][rand(0, 3)];
        log.push(
          `\n**Hiệp ${i}:** ${attacker.username} ${action} vào ${target.username} gây ${rand(1, damage)} sát thương!`,
        );
      }

      const outcomeText = log.join("\n");
      const winnerText = `👑 **${winner.username}** đã đánh bại ${loser.username} và giành chiến thắng vinh quang!`;
      const fullDescription = `${outcomeText}\n\n${winnerText}`;

      const description = fullDescription.length <= EMBED_DESCRIPTION_LIMIT
        ? fullDescription
        : `${fullDescription.slice(0, EMBED_DESCRIPTION_LIMIT - 15)}\n\n...`;

      const embed = successEmbed(
        description,
        "🏆 Trận đấu kết thúc!"
      );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      logger.debug(`Lệnh fight đã được thực hiện giữa ${challenger.id} và ${opponent.id} tại máy chủ ${interaction.guildId}`);
    } catch (error) {
      logger.error('Lỗi lệnh fight:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'fight',
        source: 'fight_command'
      });
    }
  },
};