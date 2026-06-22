import axios from 'axios';
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { getColor } from '../../config/bot.js';

const TMDB_API_KEY = process.env.TMDB_API_KEY || '4e44d9029b1270a757cddc766a1bcb63';
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const MAX_RESULTS = 5;

export default {
    data: new SlashCommandBuilder()
        .setName("movie")
        .setDescription("Tìm kiếm thông tin phim hoặc chương trình truyền hình")
        .addStringOption((option) =>
            option
                .setName("title")
                .setDescription("Tiêu đề phim hoặc chương trình truyền hình")
                .setRequired(true)
                .setMaxLength(100),
        )
        .addStringOption((option) =>
            option
                .setName("type")
                .setDescription("Loại nội dung muốn tìm kiếm")
                .addChoices(
                    { name: "Phim lẻ", value: "movie" },
                    { name: "Chương trình truyền hình", value: "tv" },
                )
                .setRequired(false),
        ),
    async execute(interaction) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction);
            if (!deferred) return;

            const guildConfig = await getGuildConfig(
                interaction.client,
                interaction.guild?.id,
            );

            if (guildConfig?.disabledCommands?.includes("movie")) {
                logger.warn('Lệnh movie bị vô hiệu hóa trong guild', {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'movie'
                });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Lệnh bị vô hiệu hóa",
                            "Tính năng tìm kiếm phim/chương trình truyền hình đã bị vô hiệu hóa tại máy chủ này.",
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (!TMDB_API_KEY) {
                logger.error('Khóa API TMDB chưa được cấu hình', {
                    guildId: interaction.guildId,
                    commandName: 'movie'
                });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Lỗi cấu hình",
                            "Tính năng tìm kiếm phim/truyền hình chưa được cấu hình đúng.",
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const title = interaction.options.getString("title");
            const type = interaction.options.getString("type") || "movie";

            logger.debug('Bắt đầu tìm kiếm phim', {
                userId: interaction.user.id,
                title: title,
                type: type,
                guildId: interaction.guildId
            });

            const searchResponse = await axios.get(
                `https://api.themoviedb.org/3/search/${type}`,
                {
                    params: {
                        api_key: TMDB_API_KEY,
                        query: title,
                        include_adult: guildConfig?.allowNsfwContent ? undefined : false,
                        language: guildConfig?.language || "vi-VN",
                        page: 1,
                        region: guildConfig?.region || "VN",
                    },
                    timeout: 8000,
                },
            );

            if (!searchResponse.data?.results?.length) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Không tìm thấy",
                            `Không tìm thấy ${type === "movie" ? "phim" : "chương trình truyền hình"} nào cho "${title}".`,
                        ),
                    ],
                });
            }

            const result = searchResponse.data.results[0];
            const mediaType = type === "movie" ? "Phim lẻ" : "Chương trình truyền hình";
            const mediaTitle = result.title || result.name || "Tiêu đề không xác định";
            const releaseDate = result.release_date || result.first_air_date;
            const year = releaseDate ? new Date(releaseDate).getFullYear() : "N/A";

            const detailsResponse = await axios.get(
                `https://api.themoviedb.org/3/${type}/${result.id}`,
                {
                    params: {
                        api_key: TMDB_API_KEY,
                        language: guildConfig?.language || "vi-VN",
                        append_to_response: "credits,release_dates,content_ratings",
                    },
                    timeout: 8000,
                },
            );

            const details = detailsResponse.data;
            const runtime = details.runtime
                ? `${Math.floor(details.runtime / 60)}g ${details.runtime % 60}p`
                : details.episode_run_time?.[0]
                  ? `${details.episode_run_time[0]}p mỗi tập`
                  : "N/A";

            let contentRating = "N/A";
            if (type === "movie") {
                const usCert = details.release_dates?.results?.find(r => r.iso_3166_1 === "US");
                if (usCert?.release_dates?.[0]?.certification) contentRating = usCert.release_dates[0].certification;
            } else {
                const usCert = details.content_ratings?.results?.find(r => r.iso_3166_1 === "US");
                if (usCert?.rating) contentRating = usCert.rating;
            }

            const genres = details.genres?.map((g) => g.name).join(", ") || "N/A";
            const cast = details.credits?.cast?.slice(0, 3).map((p) => p.name).join(", ") || "N/A";

            const embed = createEmbed({
                title: `${mediaTitle} (${year})`,
                description: details.overview || "Không có mô tả.",
                color: 'info'
            })
            .setURL(`https://www.themoviedb.org/${type}/${result.id}`)
            .setThumbnail(result.poster_path ? `${IMAGE_BASE_URL}${result.poster_path}` : null)
            .addFields(
                { name: "Loại", value: mediaType, inline: true },
                {
                    name: "Điểm số",
                    value: result.vote_average ? `⭐ ${result.vote_average.toFixed(1)}/10 (${result.vote_count.toLocaleString()} đánh giá)` : "N/A",
                    inline: true,
                },
                { name: "Phân loại", value: contentRating, inline: true },
                { name: "Thời lượng", value: runtime, inline: true },
                {
                    name: "Ngày phát hành",
                    value: releaseDate ? new Date(releaseDate).toLocaleDateString('vi-VN') : "N/A",
                    inline: true,
                },
                { name: "Thể loại", value: genres, inline: true },
                { name: "Diễn viên chính", value: cast, inline: false },
            )
            .setFooter({
                text: "Dữ liệu được cung cấp bởi The Movie Database",
            });

            if (result.backdrop_path) embed.setImage(`https://image.tmdb.org/t/p/w1280${result.backdrop_path}`);

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            
            logger.info('Thông tin phim đã được truy xuất', {
                userId: interaction.user.id,
                title: title,
                type: type,
                resultTitle: mediaTitle,
                guildId: interaction.guildId,
                commandName: 'movie'
            });
            
        } catch (error) {
            logger.error('Lỗi tìm kiếm phim/truyền hình', {
                error: error.message,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'movie'
            });
            
            if (error.response?.status === 404) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Không tìm thấy', 'Không tìm thấy bộ phim hoặc chương trình truyền hình yêu cầu.')]
                });
            } else if (error.response?.status === 401) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Lỗi cấu hình', 'Khóa API TMDB không hợp lệ.')],
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await handleInteractionError(interaction, error, {
                    commandName: 'movie',
                    source: 'tmdb_api'
                });
            }
        }
    },
};