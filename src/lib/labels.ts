export const SOURCE_LABEL: Record<string, string> = {
  manual: "Cadastro manual", google: "Pesquisa Google", import: "Planilha", whatsapp: "WhatsApp", campaign: "Campanha", api: "Integração",
};
export const STATUS_LABEL: Record<string, string> = {
  new: "Novo", contacted: "Contatado", in_progress: "Em atendimento", qualified: "Qualificado",
  negotiating: "Em negociação", customer: "Cliente", lost: "Perdido", unqualified: "Desqualificado",
};
export const CONSENT_LABEL: Record<string, string> = {
  unknown: "Não informado", opted_in: "Autorizou contato", opted_out: "Descadastrado",
};
export const EVENT_LABEL: Record<string, string> = {
  "contact.created": "Contato cadastrado", "contact.updated": "Dados atualizados", "contact.owner_changed": "Responsável alterado",
  "contact.tag_added": "Etiqueta aplicada", "contact.tag_removed": "Etiqueta removida", "contact.consent": "Consentimento registrado",
  "contact.list_added": "Adicionado à lista",
};
