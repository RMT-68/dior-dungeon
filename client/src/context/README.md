# Language Context Guide

This project uses a React Context (`LanguageContext`) to handle internationalization (i18n). This guide explains how to use it in your components.

## 1. Setup

The `LanguageProvider` is already wrapping the entire application in `App.jsx`, so you don't need to do any setup. The context is available globally.

## 2. Using Translations in Components

To use translations, import the `useLanguage` hook from the context file.

```jsx
import { useLanguage } from "../context/LanguageContext";

export default function MyComponent() {
  const { t } = useLanguage();

  return (
    <div>
      <h1>{t("lobby.title")}</h1>
      <button>{t("game.ready")}</button>
    </div>
  );
}
```

### The `t` Function

The `t(key)` function looks up the string in the translation dictionary.

- **Structure**: Keys are dot-notated (e.g., `lobby.createRoom`, `game.stats.hp`).
- **Fallback**: If a key is missing, it returns the key itself so you can easily spot missing translations.

## 3. Switching Languages

You can access the `language` state and `setLanguage` function to toggle languages.

```jsx
const { language, setLanguage } = useLanguage();

// Switch to Indonesian
<button onClick={() => setLanguage('id')}>Indonesia</button>

// Switch to English
<button onClick={() => setLanguage('en')}>English</button>
```

## 4. Adding New Translations

To add new text, open `client/src/context/LanguageContext.jsx` and add keys to the `translations` object for **BOTH** `en` and `id`.

**Example:**

```javascript
const translations = {
  en: {
    // ... existing keys
    profile: {
      title: "User Profile",
      edit: "Edit Profile",
    },
  },
  id: {
    // ... existing keys
    profile: {
      title: "Profil Pengguna",
      edit: "Ubah Profil",
    },
  },
};
```

## 5. Sending Language to Backend

When making API calls (like creating a room), pass the current `language` code so the server knows what language to generate AI content in.

```javascript
const { language } = useLanguage();

fetch("/api/create-room", {
  body: JSON.stringify({
    // ... other data
    language: language, // 'en' or 'id'
  }),
});
```
