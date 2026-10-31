import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  Plus,
  Search,
  Filter,
  Briefcase,
  GitGraph,
  BookOpen,
  Sparkles,
  MessageSquare,
  User,
  Calendar,
  LayoutGrid,
  BarChart2,
  Trash2,
  Settings,
  Bell,
  Users,
  Pencil,
  MoreVertical,
  MoreHorizontal,
  AlertCircle,
  AlertTriangle,
  Info,
  HelpCircle,
  Send,
  Phone,
  LogOut,
  Folder,
  FileText,
  Lock,
  RefreshCw,
  Share2,
  Copy,
  CheckCircle2,
  Clock,
  ArrowRight,
  SlidersHorizontal,
  Mail,
  Video,
  Pin,
  Archive,
  RotateCcw,
  ThumbsUp,
  Paperclip,
  Eye,
  EyeOff,
  Shield,
  Key,
  Cpu,
  Mic,
  Server,
  Smartphone,
  Globe,
  Palette,
  CreditCard,
  Wifi,
  WifiOff,
  Database,
  LucideIcon,
} from 'lucide-react';

export type AppIconName =
  | 'back'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-up'
  | 'close'
  | 'x'
  | 'check'
  | 'check-circle'
  | 'plus'
  | 'search'
  | 'filter'
  | 'sliders'
  | 'work'
  | 'axis'
  | 'knowledge'
  | 'ai'
  | 'messages'
  | 'me'
  | 'calendar'
  | 'kanban'
  | 'reports'
  | 'stats'
  | 'trash'
  | 'settings'
  | 'bell'
  | 'user'
  | 'team'
  | 'edit'
  | 'more'
  | 'more-horizontal'
  | 'alert'
  | 'warning'
  | 'info'
  | 'help'
  | 'send'
  | 'phone'
  | 'video'
  | 'mail'
  | 'pin'
  | 'archive'
  | 'undo'
  | 'thumbs-up'
  | 'paperclip'
  | 'eye'
  | 'eye-off'
  | 'logout'
  | 'folder'
  | 'file'
  | 'lock'
  | 'refresh'
  | 'share'
  | 'copy'
  | 'clock'
  | 'arrow-right'
  | 'shield'
  | 'key'
  | 'cpu'
  | 'mic'
  | 'server'
  | 'smartphone'
  | 'globe'
  | 'palette'
  | 'card'
  | 'wifi'
  | 'wifi-off'
  | 'database';

export type IconSize = 16 | 18 | 20 | 22 | 24 | 28 | 32 | number;

const ICON_MAP: Record<AppIconName, LucideIcon> = {
  back: ChevronLeft,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  close: X,
  x: X,
  check: Check,
  'check-circle': CheckCircle2,
  plus: Plus,
  search: Search,
  filter: Filter,
  sliders: SlidersHorizontal,
  work: Briefcase,
  axis: GitGraph,
  knowledge: BookOpen,
  ai: Sparkles,
  messages: MessageSquare,
  me: User,
  calendar: Calendar,
  kanban: LayoutGrid,
  reports: BarChart2,
  stats: BarChart2,
  trash: Trash2,
  settings: Settings,
  bell: Bell,
  user: User,
  team: Users,
  edit: Pencil,
  more: MoreVertical,
  'more-horizontal': MoreHorizontal,
  alert: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  help: HelpCircle,
  send: Send,
  phone: Phone,
  video: Video,
  mail: Mail,
  pin: Pin,
  archive: Archive,
  undo: RotateCcw,
  'thumbs-up': ThumbsUp,
  paperclip: Paperclip,
  eye: Eye,
  'eye-off': EyeOff,
  logout: LogOut,
  folder: Folder,
  file: FileText,
  lock: Lock,
  refresh: RefreshCw,
  share: Share2,
  copy: Copy,
  clock: Clock,
  'arrow-right': ArrowRight,
  shield: Shield,
  key: Key,
  cpu: Cpu,
  mic: Mic,
  server: Server,
  smartphone: Smartphone,
  globe: Globe,
  palette: Palette,
  card: CreditCard,
  wifi: Wifi,
  'wifi-off': WifiOff,
  database: Database,
};

export interface AppIconProps {
  name: AppIconName;
  size?: IconSize;
  className?: string;
  strokeWidth?: number;
  label?: string;
  'aria-label'?: string;
  onClick?: (e: React.MouseEvent<SVGSVGElement>) => void;
}

export const AppIcon: React.FC<AppIconProps> = ({
  name,
  size = 20,
  className = '',
  strokeWidth = 2,
  label,
  'aria-label': ariaLabelProp,
  onClick,
}) => {
  const IconComponent = ICON_MAP[name] || Info;
  const accessibleLabel = label || ariaLabelProp;

  return (
    <IconComponent
      size={size}
      strokeWidth={strokeWidth}
      className={`shrink-0 select-none ${className}`}
      aria-hidden={accessibleLabel ? undefined : true}
      aria-label={accessibleLabel}
      role={accessibleLabel ? 'img' : undefined}
      onClick={onClick}
    />
  );
};
