package reconciliation

import (
	"strings"
	"unicode"
)

// Tokens that carry no merchant information in bank narrations. They are
// dropped before comparing a bank description with a payee/description.
var noiseTokens = map[string]bool{
	"pos": true, "upi": true, "imps": true, "neft": true, "rtgs": true, "txn": true, "ref": true,
	"mbob": true, "trf": true, "to": true, "from": true, "the": true, "of": true, "and": true,
	"at": true, "by": true, "for": true, "a": true, "an": true,
}

// normalise lowercases s, strips digits and punctuation and removes common
// bank tokens. It returns the remaining tokens in input order.
func normalise(s string) []string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsSpace(r) {
			b.WriteRune(r)
		} else {
			b.WriteRune(' ')
		}
	}
	var out []string
	for _, tok := range strings.Fields(b.String()) {
		if len(tok) < 2 || noiseTokens[tok] {
			continue
		}
		out = append(out, tok)
	}
	return out
}

func tokenSet(tokens []string) map[string]bool {
	set := make(map[string]bool, len(tokens))
	for _, t := range tokens {
		set[t] = true
	}
	return set
}

// jaccard is the token-set Jaccard index of two token lists.
func jaccard(a, b []string) float64 {
	sa, sb := tokenSet(a), tokenSet(b)
	if len(sa) == 0 || len(sb) == 0 {
		return 0
	}
	inter := 0
	for t := range sa {
		if sb[t] {
			inter++
		}
	}
	return float64(inter) / float64(len(sa)+len(sb)-inter)
}

// jaroWinkler returns the Jaro-Winkler similarity of two strings in [0,1].
func jaroWinkler(a, b string) float64 {
	ra, rb := []rune(a), []rune(b)
	if len(ra) == 0 || len(rb) == 0 {
		return 0
	}
	if string(ra) == string(rb) {
		return 1
	}
	window := max(len(ra), len(rb))/2 - 1
	if window < 0 {
		window = 0
	}
	matchA := make([]bool, len(ra))
	matchB := make([]bool, len(rb))
	matches := 0
	for i := range ra {
		lo := max(0, i-window)
		hi := min(len(rb)-1, i+window)
		for j := lo; j <= hi; j++ {
			if matchB[j] || ra[i] != rb[j] {
				continue
			}
			matchA[i], matchB[j] = true, true
			matches++
			break
		}
	}
	if matches == 0 {
		return 0
	}
	trans := 0
	k := 0
	for i := range ra {
		if !matchA[i] {
			continue
		}
		for !matchB[k] {
			k++
		}
		if ra[i] != rb[k] {
			trans++
		}
		k++
	}
	m := float64(matches)
	jaro := (m/float64(len(ra)) + m/float64(len(rb)) + (m-float64(trans)/2)/m) / 3
	prefix := 0
	for i := 0; i < min(4, len(ra), len(rb)); i++ {
		if ra[i] != rb[i] {
			break
		}
		prefix++
	}
	return jaro + float64(prefix)*0.1*(1-jaro)
}

// Similarity thresholds for rules 3 and 4.
const (
	jaccardThreshold = 0.5
	jaroThreshold    = 0.88
)

// similarity compares a manual-side text (payee or description) with a bank
// description. It reports whether the pair clears the thresholds and a
// strength in [0,1] describing how far above the threshold it is.
func similarity(manual, bank string) (ok bool, strength float64) {
	mt, bt := normalise(manual), normalise(bank)
	if len(mt) == 0 || len(bt) == 0 {
		return false, 0
	}
	if j := jaccard(mt, bt); j >= jaccardThreshold {
		ok = true
		strength = max(strength, (j-jaccardThreshold)/(1-jaccardThreshold))
	}
	if jw := jaroWinkler(strings.Join(mt, " "), strings.Join(bt, " ")); jw >= jaroThreshold {
		ok = true
		strength = max(strength, (jw-jaroThreshold)/(1-jaroThreshold))
	}
	return ok, min(1, strength)
}

// CleanDescription turns a bank narration into a presentable payee, e.g.
// "MBOB/TRF/TO/ABC STORE/1234567" becomes "Abc Store". It falls back to the
// trimmed original when nothing meaningful remains.
func CleanDescription(desc string) string {
	tokens := normalise(desc)
	if len(tokens) == 0 {
		return strings.TrimSpace(desc)
	}
	for i, t := range tokens {
		r := []rune(t)
		r[0] = unicode.ToUpper(r[0])
		tokens[i] = string(r)
	}
	return strings.Join(tokens, " ")
}
