const DEFAULT_LOCALE = 'tr-TR';
const DEFAULT_TIME_ZONE = process.env.APP_TIME_ZONE || 'Europe/Istanbul';

const formatDatePart = (date, options) => new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone: DEFAULT_TIME_ZONE,
    ...options,
}).format(date);

export const getCurrentDateContext = () => {
    const now = new Date();
    const fullDate = formatDatePart(now, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        weekday: 'long',
    });
    const time = formatDatePart(now, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    const isoDate = formatDatePart(now, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).split('.').reverse().join('-');

    return {
        isoDate,
        fullDate,
        time,
        timeZone: DEFAULT_TIME_ZONE,
        instruction: [
            `BUGUNUN TARIHI: ${fullDate}`,
            `Guncel saat: ${time} (${DEFAULT_TIME_ZONE})`,
            `ISO tarih: ${isoDate}`,
            'Zamanasimi, hak dusurucu sure, faiz baslangici, iscilik alacagi, teblig ve dava suresi gibi tarih-duyarli hesaplarda bu tarihi esas al.',
            'Eski bir yila saplanma; tarih bilinmiyorsa 2024 veya benzeri varsayim yapma.',
        ].join('\n'),
    };
};
