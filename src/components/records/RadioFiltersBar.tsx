import { SelectMenu } from "../ui/SelectMenu";
import type { RadioFilters } from "../../types";

const TAG_OPTIONS = [
  { value: "", label: "Genre" },
  { value: "pop", label: "Pop" },
  { value: "rock", label: "Rock" },
  { value: "jazz", label: "Jazz" },
  { value: "classical", label: "Classical" },
  { value: "electronic", label: "Electronic" },
  { value: "hip-hop", label: "Hip-Hop" },
  { value: "country", label: "Country" },
  { value: "metal", label: "Metal" },
  { value: "folk", label: "Folk" },
  { value: "reggae", label: "Reggae" },
  { value: "blues", label: "Blues" },
  { value: "talk", label: "Talk" },
  { value: "news", label: "News" },
  { value: "sports", label: "Sports" },
  { value: "ambient", label: "Ambient" },
  { value: "dance", label: "Dance" },
  { value: "rnb", label: "R&B" },
  { value: "soul", label: "Soul" },
];

const COUNTRY_OPTIONS = [
  { value: "", label: "Country" },
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "BR", label: "Brazil" },
  { value: "JP", label: "Japan" },
  { value: "IN", label: "India" },
  { value: "RU", label: "Russia" },
  { value: "IT", label: "Italy" },
  { value: "ES", label: "Spain" },
  { value: "NL", label: "Netherlands" },
  { value: "PL", label: "Poland" },
  { value: "SE", label: "Sweden" },
];

const CODEC_OPTIONS = [
  { value: "", label: "Codec" },
  { value: "MP3", label: "MP3" },
  { value: "AAC", label: "AAC" },
  { value: "AAC+", label: "AAC+" },
  { value: "OGG", label: "OGG" },
  { value: "FLAC", label: "FLAC" },
];

const BITRATE_OPTIONS = [
  { value: "", label: "Quality" },
  { value: "64", label: "64+ kbps" },
  { value: "128", label: "128+ kbps" },
  { value: "192", label: "192+ kbps" },
  { value: "320", label: "320+ kbps" },
];

export function RadioFiltersBar({
  filters,
  onChange,
}: {
  filters: RadioFilters;
  onChange: (filters: RadioFilters) => void;
}) {
  return (
    <div className="radio-filters-bar">
      <SelectMenu
        label="Filter by genre"
        value={filters.tag}
        options={TAG_OPTIONS}
        onChange={(value) => onChange({ ...filters, tag: value })}
      />
      <SelectMenu
        label="Filter by country"
        value={filters.countrycode}
        options={COUNTRY_OPTIONS}
        onChange={(value) => onChange({ ...filters, countrycode: value })}
      />
      <SelectMenu
        label="Filter by codec"
        value={filters.codec}
        options={CODEC_OPTIONS}
        onChange={(value) => onChange({ ...filters, codec: value })}
      />
      <SelectMenu
        label="Filter by minimum bitrate"
        value={filters.bitrateMin}
        options={BITRATE_OPTIONS}
        onChange={(value) => onChange({ ...filters, bitrateMin: value })}
      />
    </div>
  );
}
