import { useState } from "react"

export default function CommandInput({ onSend, disabled }) {
  const [value, setValue] = useState("")

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!value.trim() || disabled) return
    onSend(value)
    setValue("")
  }

  return (
    <form
      className="border-top p-3 bg-white"
      onSubmit={handleSubmit}
    >
      <input
        className="form-control"
        placeholder={
          disabled
            ? "You are dead..."
            : "Type message or /command"
        }
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
      />
    </form>
  )
}
