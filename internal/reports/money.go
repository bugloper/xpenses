package reports

import "strconv"

// FormatMinor renders minor units as "1234.56" / "-1234.56" using integer
// arithmetic only. Used for CSV cells.
func FormatMinor(v int64) string {
	neg := v < 0
	if neg {
		v = -v
	}
	s := strconv.FormatInt(v/100, 10) + "." + pad2(v%100)
	if neg {
		return "-" + s
	}
	return s
}

// FormatMoney renders minor units as "Nu. 1,234.56" / "-Nu. 1,234.56" for
// human-facing output (PDF).
func FormatMoney(v int64) string {
	neg := v < 0
	if neg {
		v = -v
	}
	s := "Nu. " + groupThousands(strconv.FormatInt(v/100, 10)) + "." + pad2(v%100)
	if neg {
		return "-" + s
	}
	return s
}

func pad2(v int64) string {
	if v < 10 {
		return "0" + strconv.FormatInt(v, 10)
	}
	return strconv.FormatInt(v, 10)
}

func groupThousands(digits string) string {
	if len(digits) <= 3 {
		return digits
	}
	out := make([]byte, 0, len(digits)+len(digits)/3)
	lead := len(digits) % 3
	if lead > 0 {
		out = append(out, digits[:lead]...)
	}
	for i := lead; i < len(digits); i += 3 {
		if len(out) > 0 {
			out = append(out, ',')
		}
		out = append(out, digits[i:i+3]...)
	}
	return string(out)
}

// pct returns part/whole*100 rounded to one decimal; 0 when whole is 0.
func pct(part, whole int64) float64 {
	if whole == 0 {
		return 0
	}
	// Round half away from zero at one decimal using integer arithmetic.
	scaled := part * 1000
	q := scaled / whole
	r := scaled % whole
	if r < 0 {
		r = -r
	}
	if 2*r >= whole {
		if scaled < 0 {
			q--
		} else {
			q++
		}
	}
	return float64(q) / 10
}

// intPct returns part/whole*100 rounded to the nearest integer; 0 when whole
// is 0 and part is 0, 100 when whole is 0 but part is positive.
func intPct(part, whole int64) int {
	if whole == 0 {
		if part > 0 {
			return 100
		}
		return 0
	}
	return int((part*100 + whole/2) / whole)
}
