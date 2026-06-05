import { createElement, type ComponentType, type SVGProps } from "react"
import {
  Youtube,
  Instagram,
  Rss,
  Headphones,
  Globe,
  Mail,
  MessageCircle,
} from "lucide-react"
import { XIcon } from "@/components/icons/x-icon"
import { TikTokIcon } from "@/components/icons/tiktok-icon"
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon"
import { SnapchatIcon } from "@/components/icons/snapchat-icon"
import { FacebookIcon } from "@/components/icons/facebook-icon"
import { ThreadsIcon } from "@/components/icons/threads-icon"
import { TelegramIcon } from "@/components/icons/telegram-icon"
import { SpotifyIcon } from "@/components/icons/spotify-icon"
import { PinterestIcon } from "@/components/icons/pinterest-icon"
import { TwitchIcon } from "@/components/icons/twitch-icon"
import { DiscordIcon } from "@/components/icons/discord-icon"
import { SoundCloudIcon } from "@/components/icons/soundcloud-icon"
import { ApplePodcastsIcon } from "@/components/icons/apple-podcasts-icon"

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>

/**
 * Single mapping from `icon_name` (stored on podcast_platform_links) to
 * a React icon component. Extend this when adding new platforms.
 */
const ICON_MAP: Record<string, IconComponent> = {
  // audio
  spotify: SpotifyIcon,
  apple_podcasts: ApplePodcastsIcon,
  soundcloud: SoundCloudIcon,
  anghami: Headphones,
  rss: Rss,
  // video
  youtube: Youtube,
  youtube_music: Youtube,
  twitch: TwitchIcon,
  // social
  x: XIcon,
  instagram: Instagram,
  tiktok: TikTokIcon,
  facebook: FacebookIcon,
  threads: ThreadsIcon,
  snapchat: SnapchatIcon,
  pinterest: PinterestIcon,
  // community / messaging
  whatsapp: WhatsAppIcon,
  telegram: TelegramIcon,
  discord: DiscordIcon,
  // misc
  website: Globe,
  newsletter: Mail,
  email: Mail,
  chat: MessageCircle,
}

const FALLBACK_ICON: IconComponent = Headphones

export function getPlatformIcon(iconName: string | null | undefined): IconComponent {
  if (!iconName) return FALLBACK_ICON
  return ICON_MAP[iconName] || FALLBACK_ICON
}

interface PlatformIconProps extends SVGProps<SVGSVGElement> {
  iconName: string | null | undefined
}

export function PlatformIcon({ iconName, className, ...rest }: PlatformIconProps) {
  // createElement avoids an eslint "Cannot create components during render"
  // false-positive we'd hit by capitalizing a local variable and rendering it.
  return createElement(getPlatformIcon(iconName), { className, ...rest })
}

// Known icon names — useful for admin form dropdown
export const KNOWN_ICON_NAMES = Object.keys(ICON_MAP)
