import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { LughxBotError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Đuổi (kick) một người dùng khỏi máy chủ")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("Người dùng muốn đuổi")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Lý do đuổi"),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  category: "moderation",

  async execute(interaction, config, client) {
    try {
      
      if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        throw new LughxBotError(
          "User lacks permission",
          ErrorTypes.PERMISSION,
          "Bạn không có quyền đuổi thành viên."
        );
      }

      const targetUser = interaction.options.getUser("target");
      const member = interaction.options.getMember("target");
      const reason = interaction.options.getString("reason") || "Không có lý do nào được cung cấp";

      
      if (targetUser.id === interaction.user.id) {
        throw new LughxBotError(
          "Cannot kick self",
          ErrorTypes.VALIDATION,
          "Bạn không thể tự đuổi chính mình."
        );
      }

      
      if (targetUser.id === client.user.id) {
        throw new LughxBotError(
          "Cannot kick bot",
          ErrorTypes.VALIDATION,
          "Bạn không thể đuổi bot."
        );
      }

      
      if (!member) {
        throw new LughxBotError(
          "Target not found",
          ErrorTypes.USER_INPUT,
          "Người dùng mục tiêu hiện không có trong máy chủ này.",
          { subtype: 'user_not_found' }
        );
      }

      
      if (interaction.member.roles.highest.position <= member.roles.highest.position) {
        throw new LughxBotError(
          "Cannot kick user",
          ErrorTypes.PERMISSION,
          "Bạn không thể đuổi một người dùng có vai trò cao hơn hoặc bằng bạn."
        );
      }

      
      if (!member.kickable) {
        throw new LughxBotError(
          "Bot cannot kick",
          ErrorTypes.PERMISSION,
          "Tôi không thể đuổi người dùng này. Vui lòng kiểm tra vị trí vai trò của tôi so với người dùng mục tiêu."
        );
      }

      
      await member.kick(reason);

      
      const caseId = await logModerationAction({
        client,
        guild: interaction.guild,
        event: {
          action: "Member Kicked",
          target: `${targetUser.tag} (${targetUser.id})`,
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          reason,
          metadata: {
            userId: targetUser.id,
            moderatorId: interaction.user.id
          }
        }
      });

      
      await InteractionHelper.universalReply(interaction, {
        embeds: [
          successEmbed(
            `👢 **Đã đuổi** ${targetUser.tag}`,
            `**Lý do:** ${reason}\n**ID vụ việc:** #${caseId}`,
          ),
        ],
      });
    } catch (error) {
      logger.error('Lỗi lệnh kick:', error);
      const errorEmbed_default = errorEmbed(
        "Đã xảy ra lỗi không mong muốn khi cố gắng đuổi người dùng.",
        error.message || "Không thể đuổi người dùng"
      );
      await InteractionHelper.universalReply(interaction, { embeds: [errorEmbed_default] });
    }
  }
};