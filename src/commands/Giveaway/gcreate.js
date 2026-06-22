import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { LughxBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { saveGiveaway } from '../../utils/giveaways.js';
import { 
    parseDuration, 
    validatePrize, 
    validateWinnerCount,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gcreate")
        .setDescription("Tạo một giveaway mới trong kênh chỉ định.")
        .addStringOption((option) =>
            option
                .setName("duration")
                .setDescription("Thời gian giveaway (ví dụ: 1h, 30m, 5d).")
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName("winners")
                .setDescription("Số lượng người chiến thắng.")
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("prize")
                .setDescription("Phần thưởng của giveaway.")
                .setRequired(true),
        )
        .addChannelOption((option) =>
            option
                .setName("channel")
                .setDescription("Kênh để gửi giveaway (mặc định là kênh hiện tại).")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            
            if (!interaction.inGuild()) {
                throw new LughxBotError(
                    'Giveaway command used outside guild',
                    ErrorTypes.VALIDATION,
                    'Lệnh này chỉ có thể được sử dụng trong máy chủ.',
                    { userId: interaction.user.id }
                );
            }
            
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                throw new LughxBotError(
                    'User lacks ManageGuild permission',
                    ErrorTypes.PERMISSION,
                    "Bạn cần quyền 'Quản lý máy chủ' để tạo giveaway.",
                    { userId: interaction.user.id, guildId: interaction.guildId }
                );
            }

            logger.info(`Giveaway creation started by ${interaction.user.tag} in guild ${interaction.guildId}`);
            
            const durationString = interaction.options.getString("duration");
            const winnerCount = interaction.options.getInteger("winners");
            const prize = interaction.options.getString("prize");
            const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
            
            const durationMs = parseDuration(durationString);
            validateWinnerCount(winnerCount);
            const prizeName = validatePrize(prize);
            
            if (!targetChannel.isTextBased()) {
                throw new LughxBotError(
                    'Target channel is not text-based',
                    ErrorTypes.VALIDATION,
                    'Kênh được chọn phải là kênh văn bản.',
                    { channelId: targetChannel.id, channelType: targetChannel.type }
                );
            }

            const endTime = Date.now() + durationMs;
            
            const initialGiveawayData = {
                messageId: "placeholder",
                channelId: targetChannel.id,
                guildId: interaction.guildId,
                prize: prizeName,
                hostId: interaction.user.id,
                endTime: endTime,
                endsAt: endTime,
                winnerCount: winnerCount,
                participants: [],
                isEnded: false,
                ended: false,
                createdAt: new Date().toISOString()
            };
            
            const embed = createGiveawayEmbed(initialGiveawayData, "active");
            const row = createGiveawayButtons(false);
            
            const giveawayMessage = await targetChannel.send({
                content: "🎉 **GIVEAWAY MỚI** 🎉",
                embeds: [embed],
                components: [row],
            });
            
            initialGiveawayData.messageId = giveawayMessage.id;
            const saved = await saveGiveaway(
                interaction.client,
                interaction.guildId,
                initialGiveawayData,
            );

            if (!saved) {
                logger.warn(`Failed to save giveaway to database: ${giveawayMessage.id}`);
            }
            
            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_CREATE,
                    data: {
                        description: `Giveaway đã tạo: ${prizeName}`,
                        channelId: targetChannel.id,
                        userId: interaction.user.id,
                        fields: [
                            { name: '🎁 Phần thưởng', value: prizeName, inline: true },
                            { name: '🏆 Người thắng', value: winnerCount.toString(), inline: true },
                            { name: '⏰ Thời lượng', value: durationString, inline: true },
                            { name: '📍 Kênh', value: targetChannel.toString(), inline: true }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Error logging giveaway creation event:', logError);
            }

            logger.info(`Giveaway created successfully: ${giveawayMessage.id} in ${targetChannel.name}`);
            
            await InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        `Giveaway đã bắt đầu! 🎉`,
                        `Một giveaway mới cho **${prizeName}** đã được bắt đầu tại ${targetChannel} và sẽ kết thúc trong **${durationString}**.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'gcreate',
                context: 'giveaway_creation'
            });
        }
    },
};