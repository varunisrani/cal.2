# The Coach

The Coach is a chat about your own diary. It answers with your AI provider and your key, from the
data Platewise keeps on your device. It can read your log; it cannot change anything in it.

It needs a working AI provider (see [AI keys](ai-keys.md)). A question without a photo goes to
your text model if "Different model for text" is on, otherwise to your main provider. A question
with a photo always goes to the main provider.

## Asking

- Type a question and press Send. The reply appears as the Coach writes it, word by word, with
  three dots under it until it is complete. Only the complete reply is kept in the chat. If the
  conversation is at its newest message, it moves along with the reply; if you scrolled up to
  read, it stays where you are.
- Suggested questions match your goal (lose, keep or gain weight). Tapping one sends it as your
  question, with the photo you added if there is one; what you typed stays in the box.
- Press **+** in the message box to add one photo from the camera or your photo library, for
  example a menu or a meal you are about to eat. A photo sent without words asks the Coach to have
  a look at it.
- The Coach answers in the language you write in.
- Replies can hold headings, lists, bold text and links; links open in a new tab. The copy button
  copies a reply.

While a reply is on its way, Send and the suggested questions of that chat wait for it.

**Live replies.** Platewise asks every provider to send the reply as it is written. A server that
answers only in one piece (some Custom or older Ollama servers) still works: its reply appears
when it is complete, as before. Cerebras replies always come in one piece. When the Coach looks
something up in your data first, any words it writes before looking show until the next part of
its answer replaces them. The model's own thinking is never shown. Screen readers hear "The Coach
is writing a reply" while it comes, and the reply itself once, when it is complete.

The time limit in AI settings (Give up after) counts the waiting: the wait for the reply to start
and any pause in the middle of it. A long reply that keeps coming is never cut off for its length.

## Chats

You can keep several conversations with the Coach, each on its own subject. The name of the open
chat shows under the Coach heading.

- **New chat** (the **+** at the top) opens an empty chat with the suggested questions for your
  goal. It is kept once you send its first question, so an unused new chat never piles up.
- **Chats** (the list button at the top) shows every chat, the most recently used first: its name,
  when you last used it and the start of its last message. Tap a chat to open it. The open chat is
  marked.
- A chat is named after the start of its first question (up to 60 characters). **Rename** (the
  pencil next to a chat in Chats) gives it your own name, which then stays, whatever you ask in it
  later.
- **Delete** (the bin next to a chat in Chats) deletes that chat after asking first.
- The Coach tab opens on the chat you used most recently.

**A reply keeps going when you switch.** If you open another chat or start a new one while the
Coach is answering, the reply still arrives, in the chat you asked in; open that chat again and you
see it being written. Chats shows "Replying…" on a chat whose reply is on its way, and you can ask
in another chat meanwhile; several chats can wait for replies at the same time.

Each chat sends only its own messages to your AI provider. What the Coach knows about you (below)
is the same in every chat.

## What the Coach sees

When you press Send, Platewise takes a snapshot of your data. The whole answer works from that
snapshot, so food you log while a reply is on its way shows up on your next question.

**With every question**, the Coach gets a short summary:

- today's date and your time zone, so "yesterday" or "last week" work;
- your profile: sex, age, height, weight, activity level, goal and pace, goal weight, and body fat
  and its goal if you set them;
- how your energy numbers are worked out: your resting burn, your daily burn and your current
  targets;
- a weight forecast from the last 90 finished days, once there are at least two days with food
  logged and two weigh-ins in that time;
- how much data you have: counts of weigh-ins, body-fat readings, food entries and tracked fasts,
  and whether a fast is running;
- today so far: what you have eaten, what is left of your targets, and water against its goal if
  you track water;
- today's sugar against your Sugar limit, and how many of today's foods had a sugar figure (a food
  without one is never counted as 0 g);
- your notes for the AI, if you wrote any (Settings › AI providers).

**When it needs more**, the Coach asks Platewise for it. Platewise looks it up on your device and
sends back only what was asked for:

- how far back each kind of data goes;
- weigh-ins between two dates;
- body-fat readings between two dates;
- calories eaten per day between two dates;
- single food entries between two dates: date, name, calories, protein, carbs, fat, the meal, how
  it was logged, its weight or servings, and every nutrient on record;
- fasts tracked with the fasting timer: start, end, length, goal and whether it was reached.

Each answer Platewise sends back is cut to 60 000 characters at most, and a list of weigh-ins,
body-fat readings, food entries or fasts to 365 rows at most. When rows have to be left out, the
newest are kept. A question can take up to six requests to your provider while the Coach looks
things up. A question that needs more stops with a message; ask something narrower, such as a
shorter time span.

**From the chat itself**, the words of up to 19 earlier messages of the same chat go with each
question, so the Coach can follow the conversation. Photos from earlier messages are not sent
again, and nothing from your other chats is sent.

## What the Coach does not see or do

- your diary photos, notes on entries, ingredient parts or product details;
- your saved meals and your allergen sensitivities;
- water from days other than today;
- your settings and your API keys;
- anything outside Platewise.

It cannot log, edit or delete food, or change your goals or settings. If it says it did, it did not:
make the change yourself. The only things it can set are reminders and check-ins (below).

A day with nothing logged is unknown to the Coach, not a day of zero calories and not a fast. Only
fasts you tracked with the fasting timer count as fasts. Regular logging and weigh-ins give it
more to work with.

## Reminders and check-ins

**Reminders.** Ask the Coach to remind you of something, such as "remind me to drink water at 10
every weekday". It needs what the reminder should say, the time, and the days or one date; when
one of these is missing or unclear, it asks you.

- In the Android app, while **Let the Coach set reminders** is on (Settings › Tracking &
  reminders, under Coach; on to start with), the Coach sets the reminder at once and says in its
  reply what it set. The card under the reply says **Reminder set**, with **Undo** (the reminder
  is taken away, and the card offers **Add** again) and **Edit** (the same editor as in Your
  reminders).
- On the web, and in the Android app with the switch off, the Coach only proposes the reminder:
  the card offers **Add** and **Dismiss**, and nothing is set until you tap Add.
- Either way it becomes one of Your reminders (at most 20), with the same rules as one you write
  yourself, and it shows only while Notifications is on.
- The Coach sets a reminder only when you asked for one or said yes to one it suggested, and never
  more than that.

**Check-ins** (Android app). The Coach can follow up later, for example to ask on Thursday at 7 pm
how the new breakfast went. A check-in is one short message (up to 120 characters) at a time within
the next 14 days, and at most 3 wait at once. The Coach sets one only when you asked for it or said
yes to it, and says in its reply when it will come.

- The card under its reply says **Check-in set for Thu, Oct 29, 7:00 PM**, with **Cancel**.
- At that time an Android notification, **Coach check-in**, brings the message; a tap opens that
  chat, where the message now is, as the Coach's. If Platewise was closed, the message is in the
  chat the next time you open it.
- A check-in comes in quiet hours too: you agreed to its time.
- Settings › Tracking & reminders lists the check-ins that wait, under Coach, each with
  **Delete**. Deleting a chat deletes its check-ins. They are part of your backups, with your
  chats.

**When a reply comes while you are away** (Android app): if a reply arrives while Platewise is in
the background, or while you are on another screen or in another chat, a notification **The Coach
replied** shows the start of the reply, and a tap opens that chat. Nothing comes for the chat you
are looking at. Its switch is **Coach replies** in Smart notifications, and quiet hours apply to it.

## When something goes wrong

A failed question stays in the chat with a short message. **Details** shows the provider's own
error text, with your keys removed. **Retry** asks the same question again. This is also what
happens when a reply stops halfway (the connection breaks, or the provider reports a problem in the
middle of it): the words written so far go, and nothing of the unfinished reply is kept.

If you set a standby for text or photos, it takes over once when the first provider fails, and
starts the question afresh.

## Your chat history

- Each chat keeps its newest 200 messages. Older ones are removed as new ones arrive. There is no
  limit on the number of chats.
- Photos you attached are kept as small copies in the chat.
- Your chats are part of your backups, with their names. They are not part of a diary export. A
  backup made with Platewise 1.3 or earlier restores as one chat; Platewise 1.3 restores a newer
  backup with all its messages in one conversation.
- Your conversation from before chats came (Platewise 1.3 and earlier) is your first chat, named
  after its first question, or "Earlier chat".
- **Delete chat** (the bin at the top) deletes the open chat, every message and photo in it, for
  good, after asking first, and opens a new chat. A reply that arrives after you deleted its chat
  is dropped.
- Settings › Your data › Erase everything deletes all your chats with everything else.

You can hide the Coach tab in Settings › App settings, under More, in Tab bar. Your chats stay
until you delete them.

The Coach's answers are estimates from your own log, not medical advice. For a health condition,
medication or a very low calorie target, ask a doctor or dietitian.
