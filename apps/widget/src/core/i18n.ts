import { DEFAULT_LOCALE, type GenerationStage, type Locale } from '@lumina/shared';

/**
 * Widget i18n (§3.7). A flat string table per locale (it/en/de/fr/es). The UI never hard-codes copy;
 * it calls `t()` / a bound `createTranslator()`. Merchants override any string via the dashboard, which
 * arrives as the `i18n` map on `GET /widget/config` and is layered on with `applyOverrides`.
 */

/** Canonical list of every UI string key — the single source of truth for completeness checks. */
export const STRING_KEYS = [
  'button.try',
  'close',
  'poweredBy',
  'upload.title',
  'upload.drop',
  'upload.browse',
  'upload.camera',
  'upload.hint',
  'upload.change',
  'confirm.title',
  'confirm.placementLabel',
  'confirm.generate',
  'placement.auto',
  'placement.floor',
  'placement.wall',
  'placement.table',
  'placement.corner',
  'generating.title',
  'stage.validate',
  'stage.bg_removal',
  'stage.scene_analysis',
  'stage.compose',
  'stage.moderate',
  'stage.store',
  'result.title',
  'result.before',
  'result.after',
  'result.save',
  'result.share',
  'result.regenerate',
  'feedback.up',
  'feedback.down',
  'feedback.thanks',
  'error.bad_image.title',
  'error.bad_image.body',
  'error.failed.title',
  'error.failed.body',
  'error.out_of_credits.title',
  'error.out_of_credits.body',
  'error.generic',
  'error.retry',
] as const;

export type StringKey = (typeof STRING_KEYS)[number];
export type StringTable = Record<StringKey, string>;

const en: StringTable = {
  'button.try': 'Try in your room',
  close: 'Close',
  poweredBy: 'Powered by LUMINA',
  'upload.title': 'Add a photo of your room',
  'upload.drop': 'Drag a photo here, or',
  'upload.browse': 'browse files',
  'upload.camera': 'Use camera',
  'upload.hint': 'JPG, PNG or WebP · up to {max}',
  'upload.change': 'Choose another photo',
  'confirm.title': 'Place {product}',
  'confirm.placementLabel': 'Where should it go?',
  'confirm.generate': 'Generate preview',
  'placement.auto': 'Auto',
  'placement.floor': 'On the floor',
  'placement.wall': 'On the wall',
  'placement.table': 'On a table',
  'placement.corner': 'In the corner',
  'generating.title': 'Creating your preview…',
  'stage.validate': 'Checking your photo…',
  'stage.bg_removal': 'Isolating the product…',
  'stage.scene_analysis': 'Understanding your room…',
  'stage.compose': 'Placing the product…',
  'stage.moderate': 'Final checks…',
  'stage.store': 'Almost there…',
  'result.title': "Here's your room",
  'result.before': 'Before',
  'result.after': 'After',
  'result.save': 'Save',
  'result.share': 'Share',
  'result.regenerate': 'Try again',
  'feedback.up': 'Looks great',
  'feedback.down': 'Not quite',
  'feedback.thanks': 'Thanks for the feedback!',
  'error.bad_image.title': "We couldn't use that photo",
  'error.bad_image.body': 'Please upload a clear photo of an interior room.',
  'error.failed.title': 'Something went wrong',
  'error.failed.body': "We couldn't create your preview. Please try again.",
  'error.out_of_credits.title': 'Previews are paused',
  'error.out_of_credits.body': 'This store has run out of previews for now. Check back soon.',
  'error.generic': 'Something went wrong.',
  'error.retry': 'Try again',
};

const it: StringTable = {
  'button.try': 'Provalo nella tua stanza',
  close: 'Chiudi',
  poweredBy: 'Offerto da LUMINA',
  'upload.title': 'Aggiungi una foto della tua stanza',
  'upload.drop': 'Trascina una foto qui, oppure',
  'upload.browse': 'sfoglia i file',
  'upload.camera': 'Usa la fotocamera',
  'upload.hint': 'JPG, PNG o WebP · fino a {max}',
  'upload.change': "Scegli un'altra foto",
  'confirm.title': 'Posiziona {product}',
  'confirm.placementLabel': 'Dove vuoi metterlo?',
  'confirm.generate': 'Genera anteprima',
  'placement.auto': 'Auto',
  'placement.floor': 'Sul pavimento',
  'placement.wall': 'Sulla parete',
  'placement.table': 'Su un tavolo',
  'placement.corner': "Nell'angolo",
  'generating.title': 'Sto creando la tua anteprima…',
  'stage.validate': 'Controllo la foto…',
  'stage.bg_removal': 'Isolo il prodotto…',
  'stage.scene_analysis': 'Analizzo la stanza…',
  'stage.compose': 'Posiziono il prodotto…',
  'stage.moderate': 'Ultimi controlli…',
  'stage.store': 'Ci siamo quasi…',
  'result.title': 'Ecco la tua stanza',
  'result.before': 'Prima',
  'result.after': 'Dopo',
  'result.save': 'Salva',
  'result.share': 'Condividi',
  'result.regenerate': 'Riprova',
  'feedback.up': 'Bellissimo',
  'feedback.down': 'Non proprio',
  'feedback.thanks': 'Grazie per il feedback!',
  'error.bad_image.title': 'Non possiamo usare questa foto',
  'error.bad_image.body': 'Carica una foto nitida di un interno.',
  'error.failed.title': 'Qualcosa è andato storto',
  'error.failed.body': "Non siamo riusciti a creare l'anteprima. Riprova.",
  'error.out_of_credits.title': 'Anteprime in pausa',
  'error.out_of_credits.body': 'Questo negozio ha esaurito le anteprime per ora. Torna più tardi.',
  'error.generic': 'Qualcosa è andato storto.',
  'error.retry': 'Riprova',
};

const de: StringTable = {
  'button.try': 'In deinem Raum ausprobieren',
  close: 'Schließen',
  poweredBy: 'Bereitgestellt von LUMINA',
  'upload.title': 'Füge ein Foto deines Raums hinzu',
  'upload.drop': 'Foto hierher ziehen oder',
  'upload.browse': 'Dateien durchsuchen',
  'upload.camera': 'Kamera verwenden',
  'upload.hint': 'JPG, PNG oder WebP · bis zu {max}',
  'upload.change': 'Anderes Foto wählen',
  'confirm.title': '{product} platzieren',
  'confirm.placementLabel': 'Wohin soll es?',
  'confirm.generate': 'Vorschau erstellen',
  'placement.auto': 'Auto',
  'placement.floor': 'Auf dem Boden',
  'placement.wall': 'An der Wand',
  'placement.table': 'Auf einem Tisch',
  'placement.corner': 'In der Ecke',
  'generating.title': 'Deine Vorschau wird erstellt…',
  'stage.validate': 'Foto wird geprüft…',
  'stage.bg_removal': 'Produkt wird freigestellt…',
  'stage.scene_analysis': 'Raum wird analysiert…',
  'stage.compose': 'Produkt wird platziert…',
  'stage.moderate': 'Letzte Prüfungen…',
  'stage.store': 'Fast fertig…',
  'result.title': 'Hier ist dein Raum',
  'result.before': 'Vorher',
  'result.after': 'Nachher',
  'result.save': 'Speichern',
  'result.share': 'Teilen',
  'result.regenerate': 'Nochmal',
  'feedback.up': 'Sieht super aus',
  'feedback.down': 'Nicht ganz',
  'feedback.thanks': 'Danke für dein Feedback!',
  'error.bad_image.title': 'Dieses Foto können wir nicht verwenden',
  'error.bad_image.body': 'Bitte lade ein klares Foto eines Innenraums hoch.',
  'error.failed.title': 'Etwas ist schiefgelaufen',
  'error.failed.body': 'Wir konnten keine Vorschau erstellen. Bitte versuche es erneut.',
  'error.out_of_credits.title': 'Vorschauen pausiert',
  'error.out_of_credits.body': 'Dieser Shop hat aktuell keine Vorschauen mehr. Schau bald wieder vorbei.',
  'error.generic': 'Etwas ist schiefgelaufen.',
  'error.retry': 'Erneut versuchen',
};

const fr: StringTable = {
  'button.try': 'Essayez dans votre pièce',
  close: 'Fermer',
  poweredBy: 'Proposé par LUMINA',
  'upload.title': 'Ajoutez une photo de votre pièce',
  'upload.drop': 'Glissez une photo ici, ou',
  'upload.browse': 'parcourir les fichiers',
  'upload.camera': 'Utiliser la caméra',
  'upload.hint': "JPG, PNG ou WebP · jusqu'à {max}",
  'upload.change': 'Choisir une autre photo',
  'confirm.title': 'Placer {product}',
  'confirm.placementLabel': 'Où le placer ?',
  'confirm.generate': "Générer l'aperçu",
  'placement.auto': 'Auto',
  'placement.floor': 'Au sol',
  'placement.wall': 'Au mur',
  'placement.table': 'Sur une table',
  'placement.corner': 'Dans le coin',
  'generating.title': 'Création de votre aperçu…',
  'stage.validate': 'Vérification de la photo…',
  'stage.bg_removal': 'Détourage du produit…',
  'stage.scene_analysis': 'Analyse de la pièce…',
  'stage.compose': 'Placement du produit…',
  'stage.moderate': 'Dernières vérifications…',
  'stage.store': 'Presque terminé…',
  'result.title': 'Voici votre pièce',
  'result.before': 'Avant',
  'result.after': 'Après',
  'result.save': 'Enregistrer',
  'result.share': 'Partager',
  'result.regenerate': 'Réessayer',
  'feedback.up': 'Superbe',
  'feedback.down': 'Pas tout à fait',
  'feedback.thanks': 'Merci pour votre retour !',
  'error.bad_image.title': 'Nous ne pouvons pas utiliser cette photo',
  'error.bad_image.body': "Veuillez télécharger une photo nette d'un intérieur.",
  'error.failed.title': "Une erreur s'est produite",
  'error.failed.body': "Nous n'avons pas pu créer votre aperçu. Veuillez réessayer.",
  'error.out_of_credits.title': 'Aperçus en pause',
  'error.out_of_credits.body': "Cette boutique n'a plus d'aperçus pour le moment. Revenez bientôt.",
  'error.generic': "Une erreur s'est produite.",
  'error.retry': 'Réessayer',
};

const es: StringTable = {
  'button.try': 'Pruébalo en tu habitación',
  close: 'Cerrar',
  poweredBy: 'Con tecnología de LUMINA',
  'upload.title': 'Añade una foto de tu habitación',
  'upload.drop': 'Arrastra una foto aquí, o',
  'upload.browse': 'explorar archivos',
  'upload.camera': 'Usar cámara',
  'upload.hint': 'JPG, PNG o WebP · hasta {max}',
  'upload.change': 'Elegir otra foto',
  'confirm.title': 'Coloca {product}',
  'confirm.placementLabel': '¿Dónde lo pongo?',
  'confirm.generate': 'Generar vista previa',
  'placement.auto': 'Auto',
  'placement.floor': 'En el suelo',
  'placement.wall': 'En la pared',
  'placement.table': 'Sobre una mesa',
  'placement.corner': 'En la esquina',
  'generating.title': 'Creando tu vista previa…',
  'stage.validate': 'Comprobando tu foto…',
  'stage.bg_removal': 'Aislando el producto…',
  'stage.scene_analysis': 'Analizando tu habitación…',
  'stage.compose': 'Colocando el producto…',
  'stage.moderate': 'Comprobaciones finales…',
  'stage.store': 'Casi listo…',
  'result.title': 'Aquí está tu habitación',
  'result.before': 'Antes',
  'result.after': 'Después',
  'result.save': 'Guardar',
  'result.share': 'Compartir',
  'result.regenerate': 'Reintentar',
  'feedback.up': 'Se ve genial',
  'feedback.down': 'No del todo',
  'feedback.thanks': '¡Gracias por tu opinión!',
  'error.bad_image.title': 'No podemos usar esa foto',
  'error.bad_image.body': 'Sube una foto nítida de un interior.',
  'error.failed.title': 'Algo salió mal',
  'error.failed.body': 'No pudimos crear tu vista previa. Inténtalo de nuevo.',
  'error.out_of_credits.title': 'Vistas previas en pausa',
  'error.out_of_credits.body': 'Esta tienda se quedó sin vistas previas por ahora. Vuelve pronto.',
  'error.generic': 'Algo salió mal.',
  'error.retry': 'Reintentar',
};

export const STRINGS: Record<Locale, StringTable> = { it, en, de, fr, es };

export type TVars = Record<string, string | number>;

function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Translate a key for a locale, falling back to English then the key itself. Stateless. */
export function t(locale: Locale, key: StringKey, vars?: TVars): string {
  const table = STRINGS[locale] ?? STRINGS[DEFAULT_LOCALE];
  const template = table[key] ?? STRINGS[DEFAULT_LOCALE][key] ?? key;
  return interpolate(template, vars);
}

/** Layer merchant overrides (from `/widget/config` → `i18n`) over a base table. */
export function applyOverrides(
  base: StringTable,
  overrides?: Record<string, string>,
): Record<string, string> {
  return overrides ? { ...base, ...overrides } : { ...base };
}

/** A translator bound to a locale (+ optional overrides) — what the UI uses. */
export function createTranslator(
  locale: Locale,
  overrides?: Record<string, string>,
): (key: StringKey, vars?: TVars) => string {
  const table = applyOverrides(STRINGS[locale] ?? STRINGS[DEFAULT_LOCALE], overrides);
  return (key, vars) => interpolate(table[key] ?? STRINGS[DEFAULT_LOCALE][key] ?? key, vars);
}

/** Map a pipeline stage to its progress-hint string key (`stage.<stage>`). */
export function stageStringKey(stage: GenerationStage): StringKey {
  return `stage.${stage}` as StringKey;
}
