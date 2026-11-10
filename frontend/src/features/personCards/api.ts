import { apiRequest } from '../../api/client'
import type { CardTemplate, CardStyle, CardView } from './model'

export const saveCardTemplate = (projectId: number, value: CardTemplate) => apiRequest<{ card_template_json: CardTemplate }>(`/projects/${projectId}/card-template`, { method: 'PUT', body: JSON.stringify(value) })
export const saveCardStyle = (projectId: number, nodeId: number, value: CardStyle) => apiRequest<{ card_style_json: CardStyle }>(`/projects/${projectId}/nodes/${nodeId}/card-style`, { method: 'PUT', body: JSON.stringify(value) })
export const loadCardViews = () => apiRequest<{ ui: { person_cards?: Record<string, CardView> } }>('/users/me/ui-prefs')
export const saveCardView = (projectId: number, value: CardView) => apiRequest('/users/me/ui-prefs', { method: 'PUT', body: JSON.stringify({ person_cards: { [projectId]: value } }) })
