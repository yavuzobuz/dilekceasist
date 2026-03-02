import { supabase } from '../../lib/supabase';

export interface UserCustomTemplate {
    id: string;
    user_id: string;
    template_type: 'dilekce' | 'sozlesme' | 'ihtarname';
    title: string;
    description: string | null;
    content: string;
    style_notes: string | null;
    variables: Array<{
        key: string;
        label: string;
        type: string;
        placeholder?: string;
        required?: boolean;
    }>;
    source_file_name: string | null;
    created_at: string;
    updated_at: string;
}

export type UserCustomTemplateInsert = Omit<UserCustomTemplate, 'id' | 'created_at' | 'updated_at'>;
export type UserCustomTemplateUpdate = Partial<Omit<UserCustomTemplate, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

/**
 * Kullanıcıya ait özel şablonları getirir.
 */
export const fetchUserTemplates = async (userId: string): Promise<UserCustomTemplate[]> => {
    const { data, error } = await supabase
        .from('user_custom_templates')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

    if (error) throw new Error(`Özel şablonlar yüklenemedi: ${error.message}`);
    return (data || []) as UserCustomTemplate[];
};

/**
 * Yeni özel şablon oluşturur.
 */
export const createUserTemplate = async (
    template: UserCustomTemplateInsert
): Promise<UserCustomTemplate> => {
    const { data, error } = await supabase
        .from('user_custom_templates')
        .insert(template)
        .select()
        .single();

    if (error) throw new Error(`Şablon kaydedilemedi: ${error.message}`);
    return data as UserCustomTemplate;
};

/**
 * Mevcut özel şablonu günceller.
 */
export const updateUserTemplate = async (
    id: string,
    updates: UserCustomTemplateUpdate
): Promise<UserCustomTemplate> => {
    const { data, error } = await supabase
        .from('user_custom_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw new Error(`Şablon güncellenemedi: ${error.message}`);
    return data as UserCustomTemplate;
};

/**
 * Özel şablonu siler.
 */
export const deleteUserTemplate = async (id: string): Promise<void> => {
    const { error } = await supabase
        .from('user_custom_templates')
        .delete()
        .eq('id', id);

    if (error) throw new Error(`Şablon silinemedi: ${error.message}`);
};

/**
 * İçerikteki {{ALAN_ADI}} kalıplarını otomatik tespit eder ve TemplateVariable dizisi döndürür.
 */
export const extractVariablesFromContent = (
    content: string
): Array<{ key: string; label: string; type: string; placeholder?: string; required?: boolean }> => {
    const regex = /\{\{([A-ZÇĞİÖŞÜa-zçğıöşü_][A-ZÇĞİÖŞÜa-zçğıöşü0-9_]*)\}\}/g;
    const found = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
        found.add(match[1]);
    }

    return Array.from(found).map(key => ({
        key,
        label: key.replace(/_/g, ' '),
        type: 'text',
        placeholder: `${key} değerini girin`,
        required: true,
    }));
};
