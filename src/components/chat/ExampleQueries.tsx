import React, { useMemo } from 'react';

// Define an interface for the example query type
export interface ExampleQuery {
  emojis: string;
  label: string;
  query: string;
}

interface ExampleQueriesProps {
  onSelectQuery: (query: string) => void;
}

/**
 * Component for displaying example query suggestions
 */
const ExampleQueries: React.FC<ExampleQueriesProps> = ({ onSelectQuery }) => {
  // Array of example queries
  const exampleQueries: ExampleQuery[] = [
    {
      emojis: "🇮🇷 🕵️ 🗃️",
      label: "CIA and the Iranian Revolution",
      query: "What did the CIA know about the Iranian Revolution before it happened? Focus on intelligence reports from 1975-1979."
    },
    {
      emojis: "🌐 💼 🇨🇳",
      label: "China WTO Entry",
      query: "What were the key debates and policy considerations around China's admission to the WTO between 1995-2001, and how did the U.S. justify supporting its entry?"
    },
    {
      emojis: "🇱🇾 📧 🧨",
      label: "Clinton Benghazi Emails",
      query: "I want to know what Clinton emails pertain to Benghazi and what they were talking about as it was unfolding in September 2012. Make sure to tell me who each email was from and who it was to if that information is available."
    },
    {
      emojis: "🇻🇳 🕴️ 📜",
      label: "Eisenhower Vietnam Policy",
      query: "How did early Vietnam debates inside Eisenhower's cabinet between 1954-1960 shape America's path to war?"
    },
    {
      emojis: "🇨🇺 🛥️ 📝",
      label: "Bay of Pigs Intelligence",
      query: "What were the key intelligence failures leading up to the Bay of Pigs invasion in April 1961? Include any warning signs that were missed."
    },
    {
      emojis: "🧱 🇩🇪 📨",
      label: "Berlin Wall Crisis",
      query: "Show me diplomatic cables about the Berlin Wall's construction in August 1961 and the initial Western response through 1962."
    },
    {
      emojis: "🇨🇳 🤝 🕵️",
      label: "Nixon's China Opening",
      query: "How did the Nixon administration secretly prepare for engagement with China between 1969-1972? Include details about backchannel communications."
    },
    {
      emojis: "🚀 🇨🇺 ⚠️",
      label: "Cuban Missile Crisis",
      query: "Find documents discussing the Cuban Missile Crisis decision-making process in October 1962, especially ExComm deliberations."
    },
    {
      emojis: "🌎 🕴️ 🔍",
      label: "CIA in Latin America",
      query: "What did declassified documents reveal about CIA involvement in Latin American governments during the Cold War, particularly between 1960-1980?"
    },
    {
      emojis: "🇦🇫 🇷🇺 📊",
      label: "Soviet-Afghan Intelligence",
      query: "Show me intelligence assessments of Soviet capabilities before the Afghan invasion in December 1979. What did the US know in advance?"
    },
    {
      emojis: "🛢️ 🇸🇦 💵",
      label: "US-Saudi Post-Oil Crisis",
      query: "What do State Department cables reveal about US-Saudi relations after the 1973 oil crisis through 1980?"
    },
    {
      emojis: "☢️ 🇵🇰 📡",
      label: "Pakistan Nuclear Program",
      query: "How did US intelligence track nuclear proliferation in Pakistan during the 1980s? What concerns were raised between 1984-1990?"
    },
    {
      emojis: "🇮🇷 💰 🔗",
      label: "Iran-Contra Affair",
      query: "Find documents about the Reagan administration's internal debates on the Iran-Contra affair between 1985-1987."
    },
    {
      emojis: "🇨🇳 ✊ 📝",
      label: "Tiananmen Square Reports",
      query: "What did US diplomats report about the Tiananmen Square protests as they were happening in May-June 1989?"
    },
    {
      emojis: "🇷🇸 🧩 🌍",
      label: "Yugoslavia Breakup",
      query: "How did the State Department assess the breakup of Yugoslavia in diplomatic cables between 1990-1992?"
    },
    {
      emojis: "🇪🇬 🇮🇱 ✍️",
      label: "Camp David Accords",
      query: "What were the U.S. diplomatic cables discussing about the Camp David Accords in 1978? Include assessment of negotiations and expectations."
    },
    {
      emojis: "🇬🇭 🌍 📜",
      label: "Ghana's Independence",
      query: "How did the U.S. respond to Ghana's independence movement in the 1950s based on declassified reports from 1953-1957?"
    }
  ];

  // Function to get random items from an array
  const getRandomQueries = (queries: ExampleQuery[], count = 4): ExampleQuery[] => {
    const shuffled = [...queries].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };

  // Memoize the random queries so they only get randomized on initial load
  const randomizedQueries = useMemo(() => getRandomQueries(exampleQueries), []);

  return (
    <div className="mt-6">
      <h5 className="font-sans text-gray-500 mb-3 text-left text-xs tracking-wider">
        TRY AN EXAMPLE QUERY:
      </h5>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {randomizedQueries.map((item, index) => (
          <button
            key={index}
            onClick={() => onSelectQuery(item.query)}
            className="text-left border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-all duration-200 hover:shadow-sm cursor-pointer flex items-center gap-2 rounded-md"
          >
            <span className="text-gray-700 text-sm font-sans flex items-center gap-2">
              <span className="text-xl">{item.emojis}</span> {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ExampleQueries; 