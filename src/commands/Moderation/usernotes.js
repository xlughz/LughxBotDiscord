import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getFromDb, setInDb, deleteFromDb } from '../../utils/database.js';
import { sanitizeInput } from '../../utils/sanitization.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

function getUserNotesKey(guildId, userId) {
    return `moderation_user_notes_${guildId}_${userId}`;
}

function getGuildNotesListKey(guildId) {
    return `moderation_user_notes_list_${guildId}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName("usernotes")
        .setDescription("Quản lý ghi chú người dùng cho mục đích kiểm duyệt")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Thêm một ghi chú cho người dùng")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Người dùng muốn thêm ghi chú")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("note")
                        .setDescription("Nội dung ghi chú")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Loại ghi chú")
                        .addChoices(
                            { name: "Cảnh báo", value: "warning" },
                            { name: "Tích cực", value: "positive" },
                            { name: "Trung lập", value: "neutral" },
                            { name: "Khẩn cấp", value: "alert" }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("view")
                .setDescription("Xem ghi chú của một người dùng")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Người dùng muốn xem ghi chú")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Xóa một ghi chú cụ thể của người dùng")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Người dùng muốn xóa ghi chú")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("index")
                        .setDescription("Số thứ tự của ghi chú muốn xóa")
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("clear")
                .setDescription("Xóa tất cả ghi chú của một người dùng")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Người dùng muốn xóa sạch ghi chú")
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: "moderation",

    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Từ chối quyền truy cập",
                        "Bạn không có quyền quản lý ghi chú người dùng."
                    ),
                ],
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser("target");
        const guildId = interaction.guild.id;

        if (!["view", "remove", "clear", "add"].includes(subcommand)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Lệnh con không hợp lệ",
                        "Vui lòng chọn một lệnh con hợp lệ."
                    ),
                ],
            });
        }

        let notes = [];
        if (targetUser) {
            const notesKey = getUserNotesKey(guildId, targetUser.id);
            notes = await getFromDb(notesKey, []);
        }

        try {
            switch (subcommand) {
                case "add":
                    return await handleAddNote(interaction, targetUser, notes, guildId);
                case "view":
                    return await handleViewNotes(interaction, targetUser, notes);
                case "remove":
                    return await handleRemoveNote(interaction, targetUser, notes, guildId);
                case "clear":
                    return await handleClearNotes(interaction, targetUser, notes, guildId);
                default:
                    return InteractionHelper.safeReply(interaction, {
                        embeds: [
                            errorEmbed(
                                "Lệnh con không hợp lệ",
                                "Vui lòng chọn một lệnh con hợp lệ."
                            ),
                        ],
                    });
            }
        } catch (error) {
            logger.error(`Lỗi trong lệnh usernotes (${subcommand}):`, error);
            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Lỗi hệ thống",
                        "Đã xảy ra lỗi khi xử lý yêu cầu của bạn. Vui lòng thử lại sau."
                    ),
                ],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};

async function handleAddNote(interaction, targetUser, notes, guildId) {
    let note = interaction.options.getString("note").trim();
    const type = interaction.options.getString("type") || "neutral";

    if (note.length > 1000) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                errorEmbed(
                    "Ghi chú quá dài",
                    "Ghi chú phải dưới 1000 ký tự."
                ),
            ],
        });
    }

    if (note.length === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                errorEmbed(
                    "Ghi chú trống",
                    "Ghi chú không được để trống."
                ),
            ],
        });
    }

    note = sanitizeInput(note);

    const noteData = {
        id: Date.now(),
        content: note,
        type: type,
        author: interaction.user.tag,
        authorId: interaction.user.id,
        timestamp: new Date().toISOString()
    };

    notes.push(noteData);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} Đã thêm ghi chú`,
                `Đã thêm ghi chú **${type}** cho **${targetUser.tag}**:\n\n` +
                `> ${note}\n\n` +
                `**Người điều hành:** ${interaction.user.tag}\n` +
                `**Tổng số ghi chú:** ${notes.length}`
            )
        ]
    });
}

async function handleViewNotes(interaction, targetUser, notes) {
    if (notes.length === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "📝 Không có ghi chú",
                    `Không có ghi chú nào cho **${targetUser.tag}**.`
                ),
            ],
        });
    }

    const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let description = `**Ghi chú cho ${targetUser.tag} (${targetUser.id}):**\n\n`;
    
    sortedNotes.forEach((note, index) => {
        const typeInfo = getNoteTypeInfo(note.type);
        const date = new Date(note.timestamp).toLocaleDateString();
        description += `${typeInfo.emoji} **Ghi chú #${index + 1}** (${note.type}) - ${date}\n`;
        description += `> ${note.content}\n`;
        description += `*Thêm bởi ${note.author}*\n\n`;
    });

    if (description.length > 4000) {
        description = description.substring(0, 3900) + "\n... *(đã cắt bớt)*";
    }

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            infoEmbed(
                `📝 Ghi chú người dùng (${notes.length})`,
                description
            )
        ]
    });
}

async function handleRemoveNote(interaction, targetUser, notes, guildId) {
    const index = interaction.options.getInteger("index") - 1;

    if (index < 0 || index >= notes.length) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                errorEmbed(
                    "Chỉ số không hợp lệ",
                    `Vui lòng cung cấp chỉ số ghi chú hợp lệ (1-${notes.length}).`
                ),
            ],
        });
    }

    const removedNote = notes[index];
    notes.splice(index, 1);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(removedNote.type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} Đã xóa ghi chú`,
                `Đã xóa ghi chú #${index + 1} của **${targetUser.tag}**:\n\n` +
                `> ${removedNote.content}\n\n` +
                `**Số ghi chú còn lại:** ${notes.length}`
            )
        ]
    });
}

async function handleClearNotes(interaction, targetUser, notes, guildId) {
    const noteCount = notes.length;
    
    if (noteCount === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "Không có ghi chú để xóa",
                    `**${targetUser.tag}** không có ghi chú nào để xóa.`
                ),
            ],
        });
    }

    notes.length = 0;

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                "🗑️ Đã xóa sạch ghi chú",
                `Đã xóa sạch **${noteCount}** ghi chú của **${targetUser.tag}**.`
            )
        ]
    });
}

function getNoteTypeInfo(type) {
    const types = {
        warning: { emoji: "⚠️", color: "#FF6B6B" },
        positive: { emoji: "✅", color: "#51CF66" },
        neutral: { emoji: "📝", color: "#74C0FC" },
        alert: { emoji: "🚨", color: "#FFD43B" }
    };
    
    return types[type] || types.neutral;
}