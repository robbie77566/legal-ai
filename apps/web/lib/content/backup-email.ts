/**
 * Backup email (your_account "Backup email (2026-10-24)"): the card on the
 * family account page and the public confirm page. Daybreak voice; `{email}`
 * and `{date}` are filled with `tpl`. The ops profile card has its own
 * English copy in the console's register.
 */
export const BACKUP_EMAIL_CONTENT = {
  en: {
    label: 'Backup email',
    explain: 'Used to reach you if you lose access to your main address. Password-reset links can go to it once it is verified.',
    none: 'Not set',
    pending: 'Pending — check {email} for a link we sent {date}.',
    verified: '{email} · verified {date}',
    placeholder: 'Backup email address',
    add: 'Add backup email',
    change: 'Change',
    remove: 'Remove',
    resend: 'Resend link',
    cancel: 'Cancel',
    notices: {
      added: 'We sent a link to {email}. Your backup email starts working once you open it.',
      resent: 'We sent a new link to {email}.',
      removed: 'Backup email removed.',
    },
    confirm: {
      busy: 'Confirming…',
      incomplete: 'This link isn’t complete — use the full link from your email.',
      doneTitle: 'Your backup email is verified',
      doneBody: 'From now on, {email} can receive password-reset links for your account, and it will hear about changes to your password and email.',
      failTitle: 'We couldn’t confirm that',
      failBody: 'This link is invalid or has expired — add the backup email again from your account page to get a new one.',
      signIn: 'Go to sign in',
    },
  },
  es: {
    label: 'Correo de respaldo',
    explain: 'Lo usamos para comunicarnos con usted si pierde el acceso a su dirección principal. Los enlaces para restablecer la contraseña pueden ir ahí una vez verificado.',
    none: 'No configurado',
    pending: 'Pendiente — revise {email}: le enviamos un enlace el {date}.',
    verified: '{email} · verificado el {date}',
    placeholder: 'Correo de respaldo',
    add: 'Agregar correo de respaldo',
    change: 'Cambiar',
    remove: 'Quitar',
    resend: 'Reenviar enlace',
    cancel: 'Cancelar',
    notices: {
      added: 'Enviamos un enlace a {email}. Su correo de respaldo empieza a funcionar cuando lo abra.',
      resent: 'Enviamos un enlace nuevo a {email}.',
      removed: 'Correo de respaldo eliminado.',
    },
    confirm: {
      busy: 'Confirmando…',
      incomplete: 'Este enlace no está completo — use el enlace completo de su correo.',
      doneTitle: 'Su correo de respaldo está verificado',
      doneBody: 'A partir de ahora, {email} puede recibir enlaces para restablecer la contraseña de su cuenta, y se le avisará de los cambios en su contraseña y su correo.',
      failTitle: 'No pudimos confirmarlo',
      failBody: 'Este enlace no es válido o ha caducado — agregue el correo de respaldo de nuevo desde su página de cuenta para recibir uno nuevo.',
      signIn: 'Ir a iniciar sesión',
    },
  },
}
