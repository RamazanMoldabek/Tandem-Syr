import re

KZ_VOWELS = set("аәеёиоөуүұыіэюяАӘЕЁИОӨУҮҰЫІЭЮЯ")
CONFUSING_CHARS = {
    "қ": "k_hard", "Қ": "k_hard",
    "к": "k_soft", "К": "k_soft",
    "ғ": "g_hard", "Ғ": "g_hard",
    "г": "g_soft", "Г": "g_soft",
    "ң": "n_nasal", "Ң": "n_nasal",
    "н": "n_front", "Н": "n_front",
    "ү": "u_front", "Ү": "u_front",
    "ұ": "u_back",  "Ұ": "u_back",
    "ө": "o_front", "Ө": "o_front",
    "о": "o_back",  "О": "o_back",
}


def _mark_semivowel_u(word: str) -> str:
    """
    В казахском языке 'у' рядом с другой гласной (ау-мақ, ша-руа, тау)
    выступает как согласный звук [w] и не образует отдельного слога.
    """
    chars = list(word)
    vowels_no_u = KZ_VOWELS - {"у", "У"}
    for i, ch in enumerate(chars):
        if ch in ("у", "У"):
            prev_is_vowel = i > 0 and word[i - 1] in vowels_no_u
            next_is_vowel = i < len(word) - 1 and word[i + 1] in vowels_no_u
            if prev_is_vowel or next_is_vowel:
                chars[i] = "ў" if ch == "у" else "Ў"
    return "".join(chars)


def split_word_to_syllables(word: str) -> list[str]:
    masked = _mark_semivowel_u(word)
    vowel_indices = [i for i, ch in enumerate(masked) if ch in KZ_VOWELS]

    if len(vowel_indices) <= 1:
        return [word]

    syllables = []
    start = 0

    for idx in range(len(vowel_indices) - 1):
        v1 = vowel_indices[idx]
        v2 = vowel_indices[idx + 1]
        consonants_between = v2 - v1 - 1

        if consonants_between <= 1:
            split_pos = v1 + 1
        elif consonants_between == 2:
            split_pos = v1 + 2
        else:
            split_pos = v2 - 1

        # Берем срез из оригинального слова (с нормальной буквой 'у')
        syllables.append(word[start:split_pos])
        start = split_pos

    syllables.append(word[start:])
    return syllables


def format_for_dyslexia(text: str) -> dict:
    tokens = re.findall(r'\w+|[^\w\s]+|\s+', text)
    structured_words = []
    hyphenated_parts = []

    for token in tokens:
        if not token.strip() or not re.search(r'[а-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ]', token):
            hyphenated_parts.append(token)
            structured_words.append({"type": "punct_or_space", "raw": token})
            continue

        syllables = split_word_to_syllables(token)
        hyphenated_parts.append("-".join(syllables))

        syllable_objects = []
        for syl in syllables:
            chars = [{"char": ch, "highlight": CONFUSING_CHARS.get(ch)} for ch in syl]
            syllable_objects.append({"text": syl, "chars": chars})

        structured_words.append({
            "type": "word",
            "raw": token,
            "syllables": syllable_objects
        })

    return {
        "syllable_text": "".join(hyphenated_parts),
        "tokens": structured_words
    }


if __name__ == "__main__":
    sample_text = (
        "Сырдария өзені Қызылорда облысының аумағынан ағып өтіп, "
        "Кіші Арал теңізіне құяды. Бұл өңірде күріш шаруашылығы жақсы дамыған."
    )
    print(format_for_dyslexia(sample_text)["syllable_text"])