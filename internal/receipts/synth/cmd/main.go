// Writes the synthetic success screenshots used by the browser tests:
//
//	go run ./internal/receipts/synth/cmd mbob testdata/receipts/mbob_synthetic.png
//	go run ./internal/receipts/synth/cmd mpay testdata/receipts/mpay_synthetic.png
package main

import (
	"fmt"
	"os"

	"github.com/bugloper/xpenses/internal/receipts/synth"
)

func main() {
	if len(os.Args) != 3 || (os.Args[1] != "mbob" && os.Args[1] != "mpay") {
		fmt.Fprintln(os.Stderr, "usage: mkfixture mbob|mpay <out.png>")
		os.Exit(2)
	}
	f, err := os.Create(os.Args[2])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer f.Close()
	draw := func() error { return synth.MBoB(f, synth.DefaultMBoB) }
	if os.Args[1] == "mpay" {
		draw = func() error { return synth.MPay(f, synth.DefaultMPay) }
	}
	if err := draw(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
