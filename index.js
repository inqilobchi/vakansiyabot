require('dotenv').config();
const Fastify = require('fastify');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const fastify = Fastify({ logger: true });
// ====== Konfiguratsiya ======
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { webHook: true });

const WEBHOOK_PATH = `/webhook/${token}`;
const FULL_WEBHOOK_URL = `${process.env.PUBLIC_URL}${WEBHOOK_PATH}`;

// Webhook endpoint
fastify.post(WEBHOOK_PATH, (req, reply) => {
  try {
    bot.processUpdate(req.body);  // Telegram update-larni botga uzatish juda muhim
    console.log('Update processed:', req.body);
    reply.code(200).send();       // Telegram API uchun 200 OK javob qaytarish kerak
  } catch (error) {
    console.error('Error processing update:', error);
    reply.sendStatus(500);
  }
});

// Health check endpoint
fastify.get('/healthz', (req, reply) => {
  reply.send({ status: 'ok' });
});

// Serverni ishga tushirish va webhook o‘rnatish
fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' }, async (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  fastify.log.info(`Server listening at ${address}`);

  try {
const response = await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, null, {
  params: { url: FULL_WEBHOOK_URL }
});

    if (response.data.ok) {
      fastify.log.info('Webhook successfully set:', response.data);
    } else {
      fastify.log.error('Failed to set webhook:', response.data);
    }
  } catch (error) {
    fastify.log.error('Error setting webhook:', error.message);
  }
});
let botUsername = "";

bot.getMe().then(me => {
  botUsername = me.username;
});

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log("✅ MongoDB ulandi");
}).catch(err => {
  console.error("❌ MongoDB xatolik:", err);
});

// Admin ID’lari (vergul bilan ajratilgan) — .env ichida misol: ADMIN_IDS=12345,67890
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(",").map(id => parseInt(id))
  : [];

// Majburiy kanal username (misol: "@mychannel"). Eʼtibor: username bilan “@” belgisi bilan yozing.
const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL || "@YourChannelUsername";

// ====== Mongoose modellari ======
 
// Foydalanuvchi modeli
const userSchema = new mongoose.Schema({
  chatId: { type: Number, unique: true },
  fullName: String,
  phone: String,
  age: Number,
  weight: Number,
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Vakansiya modeli
const vacancySchema = new mongoose.Schema({
  when: String,
  title: String,
  workersNeeded: Number,
  workType: String,
  salary: String,
  meal: String,
  time: String,
  address: String,
  serviceFee: String,
  extra: String,
  status: { type: String, default: "active" },  // “active”, “done” yoki “closed”
  channelMessageId: { type: Number, default: null },
  createdAt: { type: Date, default: Date.now }
});
const Vacancy = mongoose.model('Vacancy', vacancySchema);
const applicationSchema = new mongoose.Schema({
  userChatId: { type: Number, required: true },
  vacId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vacancy', required: true },
  status: { type: String, default: "tasdiqlangan" },  // "applied", "confirmed", "rejected"
  appliedAt: { type: Date, default: Date.now },
  confirmedAt: { type: Date, default: null }
});
const Application = mongoose.model('Application', applicationSchema);
// ====== Foydalanuvchi va admin holatlarini saqlash ======
const userState = {};     // foydalanuvchi holatlari
const adminState = {};    // admin holatlari

// ====== Yordamchi funksiyalar ======

// Asosiy menyuni ko‘rsatish (foydalanuvchi uchun)
function showMainMenu(chatId, fullName) {
  const greeting = fullName
    ? `👋 Salom, ${fullName}!\n\nBotga xush kelibsiz! Quyidagi tugmalardan birini tanlang:`
    : "Quyidagi menyudan birini tanlang:";
  bot.sendMessage(chatId, greeting, {
    reply_markup: {
      keyboard: [
        ["📋 Mening arizalarim", "ℹ️ Ma'lumot"],
        ["📞 Qo'llab-quvvatlash"]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  });
}
function initUserState(chatId) {
  if (!userState[chatId]) userState[chatId] = {};
  return userState[chatId];
}
// Kanalga obuna ekanligi tekshirish
async function ensureChannelSubscription(chatId) {
  try {
    const member = await bot.getChatMember(REQUIRED_CHANNEL, chatId);
    if (["creator","administrator","member"].includes(member.status)) {
      return true;
    }
    return false;
  } catch (err) {
    console.error("Kanal obuna tekshirishda xatolik:", err);
    return false;
  }
}

// ====== /start komandasi ======
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const param = match ? match[1] : null; // start parametri: masalan vac_653f...

  userState[chatId] = {};

  if (param && param.startsWith("vac_")) {
    const vacId = param.replace("vac_", "");

    const vac = await Vacancy.findById(vacId);
    if (!vac || vac.status !== "active") {
      return bot.sendMessage(chatId, "❌ Ushbu vakansiya mavjud emas yoki yopilgan.");
    }
const existingUser  = await User.findOne({ chatId });
    if (existingUser ) {
      // Agar ro'yxatdan o'tgan bo'lsa, to'g'ridan-to'g'ri to'lov bosqichiga o't
      userState[chatId] = {
        step: "payment_phase",
        applyingVac: vacId
      };

    const payText = `
📝 Ishga yozilish: ${vac.title}

💰 Ish haqqi: ${vac.salary} 
🌟 Xizmat haqi: ${vac.serviceFee} 

💳 9860 1601 1896 8066

💳 Ushbu karta raqamga ${vac.serviceFee} to‘lov qilib checkini yuboring (3 daqiqa ichida):
    `;
    await bot.sendMessage(chatId, payText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "❌ Bekor qilish", callback_data: "cancel_payment" }]
      ]
    }
    });
    console.log(userState[chatId]);
    return;   
  } else {
      userState[chatId] = {
        pendingVac: vacId  // Vakansiya ID sini saqlab qo'yamiz, ro'yxatdan o'tgandan keyin ishlatamiz
      };
            const registerFirstText = `
❌ Avval botda ro'yxatdan o'tishingiz kerak!
📋 <b>Foydalanuvchi Ofertasi</b>

ManMode Uz jamoasi tomonidan taqdim etiladigan xizmatlar uchun

<b>1. Umumiy qoidalar</b>
Ushbu kanaldan foydalanish orqali siz quyidagi shartlarga rozilik bildirasiz.
Bizning xizmat — kunlik ishlarga nomzodlarni ish beruvchilar bilan bog'lash.

<b>2. Xizmat haqi</b>
Har bir ish e'lonida xizmat haqi miqdori alohida ko'rsatiladi.
Nomzod ishga yozilishdan oldin ko'rsatilgan summani to'laydi va to'lov tasdig'ini (check) botga yuboradi.
Qalbaki check yuborish qat'iyan taqiqlanadi.

<b>3. Majburiyatlar</b>
To'lovdan so'ng nomzod ishga chiqishi shart. Sababsiz chiqmaslik xizmatdan chetlashtirishga olib keladi.
Biz ish beruvchi va nomzod o'rtasidagi nizolarga bevosita javobgar emasmiz, lekin imkon qadar yordam beramiz.

<b>4. Javobgarlik chegarasi</b>
Ish haqi, ish joyi sharoiti va boshqa qo'shimcha kelishuvlar uchun faqat ish beruvchi javobgar.
Bizning vazifamiz — faqat bog'lash va e'lonlarni yetkazish.

<b>5. To'lovni qaytarish</b>
Agar ish bekor qilinsa, pulingiz qaytarib beriladi — <b>faqatgina shanba va yakshanba kunlari</b>.

<b>6. Yakuniy shartlar</b>
Oferta va qoidalar vaqti-vaqti bilan yangilanishi mumkin.
Kanaldan foydalanish orqali siz ushbu shartlarga rozilik bildirgan bo'lasiz.
`;
      bot.sendMessage(chatId, registerFirstText, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Roziman", callback_data: "agree" },
              { text: "❌ Rad etaman", callback_data: "disagree" }
            ]
          ]
        }
     })
      return;
  }
  }    
  // Aks holda — mavjud start jarayoni davom etadi
  const existingUser = await User.findOne({ chatId });
  if (existingUser) {
    return showMainMenu(chatId, existingUser.fullName);
  }

const contractText = `
📋 <b>Foydalanuvchi Ofertasi</b>

ManMode Uz jamoasi tomonidan taqdim etiladigan xizmatlar uchun

<b>1. Umumiy qoidalar</b>
Ushbu kanaldan foydalanish orqali siz quyidagi shartlarga rozilik bildirasiz.
Bizning xizmat — kunlik ishlarga nomzodlarni ish beruvchilar bilan bog'lash.

<b>2. Xizmat haqi</b>
Har bir ish e'lonida xizmat haqi miqdori alohida ko'rsatiladi.
Nomzod ishga yozilishdan oldin ko'rsatilgan summani to'laydi va to'lov tasdig'ini (check) botga yuboradi.
Qalbaki check yuborish qat'iyan taqiqlanadi.

<b>3. Majburiyatlar</b>
To'lovdan so'ng nomzod ishga chiqishi shart. Sababsiz chiqmaslik xizmatdan chetlashtirishga olib keladi.
Biz ish beruvchi va nomzod o'rtasidagi nizolarga bevosita javobgar emasmiz, lekin imkon qadar yordam beramiz.

<b>4. Javobgarlik chegarasi</b>
Ish haqi, ish joyi sharoiti va boshqa qo'shimcha kelishuvlar uchun faqat ish beruvchi javobgar.
Bizning vazifamiz — faqat bog'lash va e'lonlarni yetkazish.

<b>5. To'lovni qaytarish</b>
Agar ish bekor qilinsa, pulingiz qaytarib beriladi — <b>faqatgina shanba va yakshanba kunlari</b>.

<b>6. Yakuniy shartlar</b>
Oferta va qoidalar vaqti-vaqti bilan yangilanishi mumkin.
Kanaldan foydalanish orqali siz ushbu shartlarga rozilik bildirgan bo'lasiz.
`;


  bot.sendMessage(chatId, contractText, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Roziman", callback_data: "agree" },
          { text: "❌ Rad etaman", callback_data: "disagree" }
        ]
      ]
    }
  });
});

// ====== /panel komandasi — Faqat adminlar uchun ======
bot.onText(/\/panel/, async (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) {
    return bot.sendMessage(chatId, "⛔ Noma'lum buyruq.");
  }
  await bot.sendMessage(chatId, "📊 Admin panelga xush kelibsiz", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📈 Statistika", callback_data: "admin_stats" }],
        [
          { text: "📋 Foydalanuvchilar ro‘yxati", callback_data: "admin_users" },
          { text: "🏢 Kanal boshqaruvi", callback_data: "admin_channels" }
        ],
        [{ text: "📝 Vakansiya qo‘shish", callback_data: "admin_add_vacancy" }]
      ]
    }
  });
});

// ====== Callback tugmalarni qabul qilish ======
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // Agar admin panel callback’lari bo‘lsa
  if (ADMIN_IDS.includes(chatId)) {
    // Adminga tegishli callback’larni boshqarish
    switch (data) {
      case "admin_stats":
        {
          const userCount = await User.countDocuments();
          const activeVacCount = await Vacancy.countDocuments({ status: "active" });
          const doneVacCount = await Vacancy.countDocuments({ status: { $in: ["done", "closed"] } });
          await bot.sendMessage(chatId, `📊 Statistika:\n\n👥 Foydalanuvchilar: ${userCount}\n🟢 Faol vakansiyalar: ${activeVacCount}\n✅ Bajarilgan vakansiyalar: ${doneVacCount}`, {
            reply_markup: { inline_keyboard: [[{ text: "🔙 Orqaga", callback_data: "admin_back" }]] }
          });
        }
        break;

      case "admin_users":
        {
          const users = await User.find().limit(50);
          let list = users.map(u => `${u.fullName} — ${u.phone}`).join("\n");
          if (!list) list = "Hozircha foydalanuvchi yo‘q.";
          await bot.sendMessage(chatId, `👥 Foydalanuvchilar:\n\n${list}`, {
            reply_markup: { inline_keyboard: [[{ text: "🔙 Orqaga", callback_data: "admin_back" }]] }
          });
        }
        break;

      case "admin_channels":
        {
          await bot.sendMessage(chatId, `🔧 Kanal boshqaruvi:`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: "➕ Kanal qo‘shish", callback_data: "admin_channel_add" }],
                [{ text: "➖ Kanal o‘chirish", callback_data: "admin_channel_remove" }],
                [{ text: "🔙 Orqaga", callback_data: "admin_back" }]
              ]
            }
          });
        }
        break;

      case "admin_add_vacancy":
        {
          adminState[chatId] = { step: "vacancy_when", vacData: {} };
          await bot.sendMessage(chatId, "📅 Qachon (masalan: Ertaga / Bugun):");
        }
        break;

      case "admin_back":
        {
          // Qayta asosiy admin panelni chiqaring
          await bot.sendMessage(chatId, "📊 Admin panelga xush kelibsiz", {
            reply_markup: {
              inline_keyboard: [
                [{ text: "📈 Statistika", callback_data: "admin_stats" }],
                [
                  { text: "📋 Foydalanuvchilar ro‘yxati", callback_data: "admin_users" },
                  { text: "🏢 Kanal boshqaruvi", callback_data: "admin_channels" }
                ],
                [{ text: "📝 Vakansiya qo‘shish", callback_data: "admin_add_vacancy" }]
              ]
            }
          });
        }
        break;

      // Kanal qo‘shish bosqichi
      case "admin_channel_add":
        {
          adminState[chatId] = { step: "channel_add" };
          await bot.sendMessage(chatId, "🔗 Kanal username’ini yuboring (masalan: @mychannel):");
        }
        break;

      case "admin_channel_remove":
        {
          adminState[chatId] = { step: "channel_remove" };
          await bot.sendMessage(chatId, "🗑 Kanal username’ini o‘chirish uchun yuboring (masalan: @mychannel):");
        }
        break;

      default:
        {
          // Adminga kirmagan callback’lar: masalan, vakansiyaga yozilish, to‘lov tasdiqlash
if (data.startsWith("admin_confirm_pay_")) {
  // format: admin_confirm_pay_<userChatId>_<vacId>
  const parts = data.split("_");
  const userChatId = parseInt(parts[3]);
  const vacId = parts[4];
  
  console.log("Confirm parts:", parts);  // <<<< Debug: Tekshirish uchun
  console.log("vacId:", vacId);         // <<<< Debug
  
  const vac = await Vacancy.findById(vacId);
  const userRec = await User.findOne({ chatId: userChatId });
  
  if (!vac) {
    return bot.answerCallbackQuery(query.id, { text: "Vakansiya topilmadi." });
  }

  // <<<< O'ZGARISH: User ma'lumotlari bo'lmasa ham davom et (oldingi maslahat)
  const userInfo = userRec 
    ? `Ismi: ${userRec.fullName}\nTelefon: ${userRec.phone}\nYoshi: ${userRec.age}\nVazni: ${userRec.weight}`
    : `User  ro'yxatdan o'tmagan (Chat ID: ${userChatId})`;

  // 1) Foydalanuvchiga xabar yubor
  await bot.sendMessage(userChatId, `✅ To'lovingiz tasdiqlandi! Endi adminga murojaat qiling: @ManMode_admin1`);

  // 2) Adminga xabar yubor
  await bot.sendMessage(chatId,
    `✅ Foydalanuvchi ro‘yxatga olindi:\n\n${userInfo}\nVakansiya: ${vac.title}`);
 try {
    await Application.create({
      userChatId,
      vacId: vac._id,
      status: "confirmed",
      confirmedAt: new Date()
    });
    console.log(`Ariza yaratildi: user ${userChatId} uchun vac ${vac._id}`);
  } catch (err) {
    console.error("Ariza yaratishda xato:", err);  // Xato bo'lsa log qil, lekin to'xtatma
  }
  // 3) Ishchi sonini kamaytir
  vac.workersNeeded -= 1;
  let wasClosed = false;
  if (vac.workersNeeded <= 0) {
    vac.status = "closed"; 
    wasClosed = true;
  }
  await vac.save();

  // <<<< O'ZGARISH: Agar yopilgan bo'lsa, kanal xabarini yangilang
  if (wasClosed && vac.channelMessageId) {
     const channelChatId = REQUIRED_CHANNEL;
    console.log("Kanal yangilash boshlandi: channelChatId=", channelChatId, "message_id=", vac.channelMessageId);
    try {
      // Tugmani olib tashlash (faqat markup yangilash)
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },  // Tugmasiz qoldir
        { chat_id: channelChatId, message_id: vac.channelMessageId }
      );
      
      // <<<< Qo'shimcha: Matnni ham yangilang (status ni o'zgartirish uchun)
      const updatedText = vac.when ? `
📅 Qachon: ${vac.when}

🌟 ${vac.title}
🫂 ${vac.workersNeeded} nafar ishchi kerak (to'ldirildi)
🔧 Ish turi: ${vac.workType}
💰 Ish haqqi: ${vac.salary}
🍛 Ovqat: ${vac.meal}
⏰ Vaqt: ${vac.time}
📱 Manzil: ${vac.address}
🌟 Xizmat haqi: ${vac.serviceFee}
📝 Qo‘shimcha: ${vac.extra}

🟥 Holat: Yopiq  
      ` : "Vakansiya yopildi.";  // Agar matn bo'lmasa
      
      await bot.editMessageText(updatedText, {
        chat_id: channelChatId,
        message_id: vac.channelMessageId,
      });
      
      console.log(`Kanal xabari yangilandi: ${vac._id}`);
    } catch (err) {
      console.error("Kanal xabarini yangilashda xato:", err);  // <<<< Xato bo'lsa log qil, lekin to'xtatma
      // Masalan: Bot kanal admin emas yoki xabar topilmadi
    }
  }

  // 4) Admin fotosidagi tugmani yangilash (eski kod, ixtiyoriy – chunki bu admin xabari)
  try {
    await bot.editMessageReplyMarkup(
      {
        inline_keyboard: vac.status === "active"
          ? [[{ text: "📝 Ishga yozilish", callback_data: `apply_vac_${vac._id}` }]]
          : []
      },
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id
      }
    );
  } catch (err) {
    console.warn("Admin xabaridagi tugma yangilashda xato:", err);
  }

  await bot.answerCallbackQuery(query.id, { text: "To‘lov tasdiqlandi." });
}
          else if (data.startsWith("admin_cancel_pay_")) {
            const parts = data.split("_");
            const userChatId = parseInt(parts[3]);
            await bot.sendMessage(userChatId, "❌ To‘lovingiz bekor qilindi.");
            await bot.answerCallbackQuery(query.id, { text: "To‘lov bekor qilindi." });
          }
        }
        break;
    }

    // Qo‘shimcha, to‘lov tasdiqlash / bekor qilish tugmalarini callback_query’da yakunlang
    return;
  }

  // Endi foydalanuvchiga tegishli callback’lar
  switch (data) {
    case "disagree":
      await bot.sendMessage(chatId, `❌ Siz shartlarni rad etdingiz.\n\nAgar qayta o‘qib chiqmoqchi bo‘lsangiz, pastdagi tugmadan foydalaning.`, {
        reply_markup: {
          inline_keyboard: [[
            { text: "🔁 Qayta boshlash", callback_data: "restart" }
          ]]
        }
      });
      break;

    case "restart":
      {
const contractText = `
📋 <b>Foydalanuvchi Ofertasi</b>

<b>ManMode Uz</b> jamoasi tomonidan taqdim etiladigan xizmatlar uchun

<b>1. Umumiy qoidalar</b>  
Ushbu kanaldan foydalanish orqali siz quyidagi shartlarga rozilik bildirasiz.  
Bizning xizmat — kunlik ishlarga nomzodlarni ish beruvchilar bilan bog'lash.

<b>2. Xizmat haqi</b>  
Har bir ish e'lonida xizmat haqi miqdori alohida ko'rsatiladi.  
Nomzod ishga yozilishdan oldin ko'rsatilgan summani to'laydi va to'lov tasdig'ini (check) botga yuboradi.  
Qalbaki check yuborish qat'iyan taqiqlanadi.

<b>3. Majburiyatlar</b>  
To'lovdan so'ng nomzod ishga chiqishi shart. Sababsiz chiqmaslik xizmatdan chetlashtirishga olib keladi.  
Biz ish beruvchi va nomzod o'rtasidagi nizolarga bevosita javobgar emasmiz, lekin imkon qadar yordam beramiz.

<b>4. Javobgarlik chegarasi</b>  
Ish haqi, ish joyi sharoiti va boshqa qo'shimcha kelishuvlar uchun faqat ish beruvchi javobgar.  
Bizning vazifamiz — faqat bog'lash va e'lonlarni yetkazish.

<b>5. Yakuniy shartlar</b>  
Oferta va qoidalar vaqti-vaqti bilan yangilanishi mumkin.  
Kanaldan foydalanish orqali siz ushbu shartlarga rozilik bildirgan bo'lasiz.
`;

        await bot.sendMessage(chatId, contractText, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Roziman", callback_data: "agree" },
                { text: "❌ Rad etaman", callback_data: "disagree" }
              ]
            ]
          }
        });
      }
      break;

    case "agree":
    const state = initUserState(chatId);
      state.step = "fullName";
      await bot.sendMessage(chatId, "👤 Iltimos, ism va familiyangizni kiriting (Masalan: Aliyev Hamza):");
      break;

    case "confirm":
      {
        const d = userState[chatId];
        try {
          await User.create({
            chatId,
            fullName: d.fullName,
            phone: d.phone,
            age: d.age,
            weight: d.weight
          });
          await bot.sendMessage(chatId, `✅ Ro'yxatdan muvaffaqiyatli o'tdingiz, ${d.fullName}!`);
          showMainMenu(chatId, d.fullName);
          delete userState[chatId];
        } catch (err) {
          console.error("Foydalanuvchini saqlash xatolik:", err);
          await bot.sendMessage(chatId, "❌ Xatolik yuz berdi. Iltimos, qayta urinib ko‘ring.");
        }
      }
      break;

    case "reenter":
      userState[chatId] = { step: "fullName" };
      await bot.sendMessage(chatId, "🔁 Qaytadan boshlaymiz. Iltimos, ism familiyangizni kiriting:");
      break;

    case "cancel_payment":
     delete userState[chatId];  // State ni o'chir
     const user = await User.findOne({ chatId });
     await bot.sendMessage(chatId, "❌ Bekor qilindi. Asosiy menyuga qaytish.");
     showMainMenu(chatId, user?.fullName || "Foydalanuvchi");
     await bot.answerCallbackQuery(query.id, { text: "Bekor qilindi." });
     break;
    default:
      // Agar boshqa callback — masalan, vakansiyaga yozilish
      if (data.startsWith("apply_vac_")) {
        const vacId = data.split("_")[2];
        const vac = await Vacancy.findById(vacId);
        if (!vac || vac.status !== "active") {
          return bot.answerCallbackQuery(query.id, { text: "Ushbu vakansiya mavjud emas yoki yopilgan." });
        }

        userState[chatId] = {
          step: "payment_phase",
          applyingVac: vacId
        };

        const payText = `
📝 Ishga yozilish: ${vac.title}

💰 Ish haqqi: ${vac.salary}
🌟 Xizmat haqi: ${vac.serviceFee}

💳 9860 1601 1896 8066

💳 Ushbu karta raqamga ${vac.serviceFee} so‘mlik to‘lov checkini yuboring (3 daqiqa ichida):
`;
        await bot.sendMessage(chatId, payText);
      }
      break;
  }
});

// ====== Xabarlar (matn, telefon, rasmlar) ======
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const state = userState[chatId];
  console.log("==== message kirib keldi ====");
  console.log("chatId:", chatId);
  console.log("state:", state);
  console.log("msg:", JSON.stringify(msg, null, 2));
  // **Kontakt (telefon) jo‘natilganda**
  if (msg.contact && state?.step === "phone") {
    let phone = msg.contact.phone_number || "";
    phone = phone.replace(/[\s-]/g, "");
    if (!phone.startsWith("+") && phone.startsWith("998")) {
      phone = "+" + phone;
    }
    if (/^\+998\d{9}$/.test(phone)) {
      state.phone = phone;
      state.step = "age";
      await bot.sendMessage(chatId, "🧓 Iltimos, yoshingizni kiriting (15–65):", {
        reply_markup: { remove_keyboard: true }
      });
    } else {
      await bot.sendMessage(chatId, "❌ Faqat +998 bilan boshlanuvchi raqam yuboring.");
    }
    return;
  }

  // Agar menyu tugmasi bo‘lsa va kanalga obuna bo‘lmasa — obuna talab qilish
  if (["📋 Mening arizalarim", "ℹ️ Ma'lumot", "📞 Qo'llab-quvvatlash"].includes(msg.text)) {
    const subscribed = await ensureChannelSubscription(chatId);
    if (!subscribed) {
      return bot.sendMessage(chatId, `🔐 Iltimos, kanalimizga obuna bo‘ling: ${REQUIRED_CHANNEL}`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "📣 Kanalga obuna bo‘lish", url: `https://t.me/${REQUIRED_CHANNEL.replace(/^@/, "")}` }
            ]
          ]
        }
      });
    }
  }
if (state && state.step === "payment_phase") {
  if (!msg.photo) {
    return bot.sendMessage(chatId, "❌ Iltimos, faqat <b>chek rasmi</b>ni yuboring.", {
      parse_mode: "HTML"
    });
  }

  // Rasm yuborilgan — adminlarga yuboramiz 
  state.step = "await_admin";
  await bot.sendMessage(chatId, "✅ To'lov checki yuborildi! ⏳ Admin tomonidan tasdiqlanishini kuting.");

  const photoId = msg.photo[msg.photo.length - 1].file_id;

  for (const adminId of ADMIN_IDS) {
    await bot.sendPhoto(adminId, photoId, {
      caption: `💳 Chek yuborildi:\nFoydalanuvchi Chat ID: ${chatId}\nVakansiya ID: ${state.applyingVac}`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Tasdiqlash", callback_data: `admin_confirm_pay_${chatId}_${state.applyingVac}` },
            { text: "❌ Bekor qilish", callback_data: `admin_cancel_pay_${chatId}_${state.applyingVac}` }
          ]
        ]
      }
    });
  }

  return; // boshqa ishlov berishni to‘xtatamiz
}
  // Agar botni xabar (faqat matn) yuborilsa
  if (!msg.text || msg.text.startsWith("/")) {
    return;
  }

  // Admin tomonidan kanal qo‘shish / o‘chirish
  if (adminState[chatId]?.step === "channel_add") {
    const uname = msg.text.trim();
    // Siz qo‘shmoqchi bo‘lgan kanalni `.env` yoki bazada saqlashingiz mumkin
    // Bu misolda esa bitta REQUIRED_CHANNEL’ni almashtiraylik:
    // Istasangiz ko‘p kanalni bazaga saqlash funkciyasini qo‘shing
    await bot.sendMessage(chatId, `Kanal qo‘shildi: ${uname}`);
    adminState[chatId] = null;
    return;
  }
  if (adminState[chatId]?.step === "channel_remove") {
    const uname = msg.text.trim();
    await bot.sendMessage(chatId, `Kanal o‘chirildi: ${uname}`);
    adminState[chatId] = null;
    return;
  }

  // Admin vakansiya qo‘shish bosqichlari
  if (adminState[chatId]?.step && adminState[chatId].vacData !== undefined) {
    const st = adminState[chatId];
    const vd = st.vacData;

    switch (st.step) {
      case "vacancy_when":
        vd.when = msg.text.trim();
        st.step = "vacancy_title";
        await bot.sendMessage(chatId, "🌟 Ish nomi (masalan: Ish #1800):");
        break;

      case "vacancy_title":
        vd.title = msg.text.trim();
        st.step = "vacancy_workers";
        await bot.sendMessage(chatId, "🫂 N necha nafar ishchi kerak:");
        break;

      case "vacancy_workers":
        vd.workersNeeded = parseInt(msg.text);
        st.step = "vacancy_type";
        await bot.sendMessage(chatId, "🔧 Ish turi:");
        break;

      case "vacancy_type":
        vd.workType = msg.text.trim();
        st.step = "vacancy_salary";
        await bot.sendMessage(chatId, "💰 Ish haqqi:");
        break;

      case "vacancy_salary":
        vd.salary = msg.text.trim();
        st.step = "vacancy_meal";
        await bot.sendMessage(chatId, "🍛 Ovqat:");
        break;

      case "vacancy_meal":
        vd.meal = msg.text.trim();
        st.step = "vacancy_time";
        await bot.sendMessage(chatId, "⏰ Ish vaqti:");
        break;

      case "vacancy_time":
        vd.time = msg.text.trim();
        st.step = "vacancy_address";
        await bot.sendMessage(chatId, "📱 Manzil:");
        break;

      case "vacancy_address":
        vd.address = msg.text.trim();
        st.step = "vacancy_serviceFee";
        await bot.sendMessage(chatId, "🌟 Xizmat haqi:");
        break;

      case "vacancy_serviceFee":
        vd.serviceFee = msg.text.trim();
        st.step = "vacancy_extra";
        await bot.sendMessage(chatId, "📝 Qo‘shimcha ma’lumot (agar bo‘lsa; bo‘lmasa “—” deb yuboring):");
        break;

      case "vacancy_extra":
        vd.extra = msg.text.trim();
        // Endi ma'lumot to‘liq, yaratish va kanalga yuborish
        try {
          const vac = await Vacancy.create(vd);
          // Kanalga yuborish
          const msgText = `
📅 Qachon: ${vac.when}

🌟 ${vac.title}
🫂 ${vac.workersNeeded} nafar ishchi kerak
🔧 Ish turi: ${vac.workType}
💰 Ish haqqi: ${vac.salary}
🍛 Ovqat: ${vac.meal}
⏰ Vaqt: ${vac.time}
📱 Manzil: ${vac.address}
🌟 Xizmat haqi: ${vac.serviceFee}
📝 Qo‘shimcha: ${vac.extra}

🟢 Holat: Faol
          `;
          const channelSentMsg = await bot.sendMessage(REQUIRED_CHANNEL, msgText, {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "📝 Ishga yozilish", url: `https://t.me/${botUsername}?start=vac_${vac._id}` }
                ]
              ]
            }
          });
          vac.channelMessageId = channelSentMsg.message_id;
          await vac.save();
          await bot.sendMessage(chatId, "✅ Vakansiya muvaffaqiyatli qo‘shildi va kanalda e’lon qilindi.");
        } catch (err) {
          console.error("Vakansiya yaratishda xato:", err);
          await bot.sendMessage(chatId, "❌ Vakansiya yaratishda xatolik yuz berdi.");
        }
        adminState[chatId] = null;
        break;
    }

    return;
  }

  // Foydalanuvchi ro‘yxatdan o‘tish bosqichlari
  if (state?.step) {
    switch (state.step) {
      case "fullName":
        if (!/^[A-Za-zА-Яа-яЁё\s]{3,}$/.test(msg.text)) {
          await bot.sendMessage(chatId, "❌ Iltimos, to‘g‘ri ism familiya kiriting.");
        } else {
          state.fullName = msg.text.trim();
          state.step = "phone";
          await bot.sendMessage(chatId, "📞 Iltimos, telefon raqamingizni ulashing:", {
            reply_markup: {
              keyboard: [[{ text: "📱 Raqamni ulashish", request_contact: true }]],
              one_time_keyboard: true,
              resize_keyboard: true
            }
          });
        }
        break;

      case "phone":
        {
          let phone = msg.text.trim().replace(/[\s-]/g, "");
          if (!phone.startsWith("+") && phone.startsWith("998")) {
            phone = "+" + phone;
          }
          if (/^\+998\d{9}$/.test(phone)) {
            state.phone = phone;
            state.step = "age";
            await bot.sendMessage(chatId, "🧓 Iltimos, yoshingizni kiriting (15–65):", {
              reply_markup: { remove_keyboard: true }
            });
          } else {
            await bot.sendMessage(chatId, "❌ Telefon raqamingiz noto‘g‘ri. +998 bilan kiriting.");
          }
        }
        break;

      case "age":
        {
          const age = parseInt(msg.text);
          if (isNaN(age) || age < 15 || age > 65) {
            await bot.sendMessage(chatId, "❌ Yoshingizni to‘g‘ri kiriting (15–65 oralig‘ida).");
          } else {
            state.age = age;
            state.step = "weight";
            await bot.sendMessage(chatId, "⚖️ Iltimos, vazningizni kiriting (40–150 kg):");
          }
        }
        break;

      case "weight":
        {
          const w = parseInt(msg.text);
          if (isNaN(w) || w < 40 || w > 150) {
            await bot.sendMessage(chatId, "❌ Vazn noto‘g‘ri. 40–150 kg oralig‘ida kiriting.");
          } else {
            state.weight = w;
            // Xulosa ko‘rsatish
            const summary = `
<b>📝 Ma'lumotlaringiz:</b>

👤 Ism Familiya: <b>${state.fullName}</b>
📞 Telefon raqami: <b>${state.phone}</b>
🧓 Yoshi: <b>${state.age}</b>
⚖️ Vazni: <b>${state.weight} kg</b>
            `;
            await bot.sendMessage(chatId, summary, {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "✅ Tasdiqlayman", callback_data: "confirm" },
                    { text: "🔁 Qayta kiritaman", callback_data: "reenter" }
                  ]
                ]
              }
            });
          }
        }
        break;

      default:
        break;
    }
    return;
  }

 
  // Foydalanuvchi menyudan biror tugmani bosganda funksiyalar
  switch (msg.text) {
case "📋 Mening arizalarim":
  try {
    // <<<< O'ZGARISH: Arizalarni bazadan oling (populate bilan vakansiya ma'lumotlarini qo'shing)
    const applications = await Application.find({ userChatId: chatId })
      .populate('vacId')  // Vakansiya ma'lumotlarini yuklang
      .sort({ appliedAt: -1 })  // Eng yangi arizalardan boshlab
      .limit(10);  // Oxirgi 10 ta
    if (applications.length === 0) {
      await bot.sendMessage(chatId, `📝 Sizda hozircha ariza yo‘q.\n\nIshga yozilish uchun kanaldagi e'lonlardan birini tanlang.`, {
        reply_markup: {
          keyboard: [["🔙 Asosiy menyu"]],
          resize_keyboard: true
        }
      });
    } else {
      // <<<< O'ZGARISH: Jadval ko'rinishida ko'rsatish
      let list = `📋 <b>Sizning arizalaringiz:</b>\n\n`;
      applications.forEach((app, index) => {
        const vac = app.vacId;  // Populate qilingan vakansiya
        const statusEmoji = app.status === "confirmed" ? "✅" : "❌";  // Holat emoji
        const date = new Date(app.appliedAt).toLocaleDateString('uz-UZ');  // Sana format
        list += `${index + 1}. <b>${vac.title}</b>\n`;
        list += `   📅 Sana: ${date}\n`;
        list += `   💼 Holat: ${statusEmoji} tasdiqlangan\n\n`;
      });
      await bot.sendMessage(chatId, list, {
        parse_mode: "HTML",
        reply_markup: {
          keyboard: [["🔙 Asosiy menyu"]],
          resize_keyboard: true
        }
      });
    }
  } catch (err) {
    console.error("Arizalarni yuklashda xato:", err);
    await bot.sendMessage(chatId, "❌ Arizalarni yuklashda xatolik. Qayta urinib ko'ring.", {
      reply_markup: {
        keyboard: [["🔙 Asosiy menyu"]],
        resize_keyboard: true
      }
    });
  }
  break;

    case "ℹ️ Ma'lumot":
      await bot.sendMessage(chatId, `
ℹ️ <b>Bot haqida ma'lumot</b>:

🤖 Bu bot ishchi va ish beruvchilar o'rtasida aloqa o'rnatish uchun yaratilgan.

📋 Bot orqali quyidagi ishlarni bajarishingiz mumkin:
• Ish e'lonlarini ko'rish
• Ishlarga yozilish
• Arizalaringizni kuzatish
• To'lov checklarini yuborish

🔧 Bot ishlatish:
1. Kanaldagi ish e'lonlarini ko'ring
2. "Ishga yozilish" tugmasini bosing
3. To'lov checkini yuboring
4. Admin tasdiqlashini kuting

📞 Savollar bo'lsa, qo'llab-quvvatlash xizmatiga murojaat qiling.
      `, {
        parse_mode: "HTML",
        reply_markup: {
          keyboard: [["🔙 Asosiy menyu"]],
          resize_keyboard: true
        }
      });
      break;

    case "📞 Qo'llab-quvvatlash":
      await bot.sendMessage(chatId, `
📞 <b>Qo'llab-quvvatlash xizmati</b>:

🔢 Telefon raqam: <b>+998 77-999-14-64</b>

⏰ Ish vaqti: 09:00 - 23:00  
📅 Ish kunlari: Dushanba - Yakshanba

❓ Savollar bo'lsa, yuqoridagi raqamga qo'ng'iroq qiling.
📱 Yoki @Mode_Menejer ga yozing.  
      `, {
        parse_mode: "HTML",
        reply_markup: {
          keyboard: [["🔙 Asosiy menyu"]],
          resize_keyboard: true
        }
      });
      break;

    case "🔙 Asosiy menyu":
      {
        const user = await User.findOne({ chatId });
        showMainMenu(chatId, user?.fullName);
      }
      break;

    default:
      // boshqa holatlar uchun hech nima qilma
      break;
  }
});
