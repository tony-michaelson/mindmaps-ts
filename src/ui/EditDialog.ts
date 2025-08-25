import { LAYOUT_CONFIG } from "../types/NodePosition";

export class EditDialog {
  private dialog: HTMLDivElement | null = null;
  private overlay: HTMLDivElement | null = null;
  private onSave?: (text: string) => void;
  private onCancel?: () => void;

  public show(currentText: string, onSave: (text: string) => void, onCancel: () => void): void {
    this.onSave = onSave;
    this.onCancel = onCancel;
    
    this.createDialog(currentText);
    document.body.appendChild(this.overlay!);
    
    const input = this.dialog!.querySelector('input') as HTMLInputElement;
    input.focus();
    input.select();
  }

  private createDialog(currentText: string): void {
    this.overlay = document.createElement('div');
    this.overlay.style.position = 'fixed';
    this.overlay.style.top = '0';
    this.overlay.style.left = '0';
    this.overlay.style.width = '100%';
    this.overlay.style.height = '100%';
    this.overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    this.overlay.style.display = 'flex';
    this.overlay.style.alignItems = 'center';
    this.overlay.style.justifyContent = 'center';
    this.overlay.style.zIndex = '10000';

    this.dialog = document.createElement('div');
    this.dialog.style.backgroundColor = 'white';
    this.dialog.style.padding = '20px';
    this.dialog.style.borderRadius = '8px';
    this.dialog.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
    this.dialog.style.minWidth = '300px';
    this.dialog.style.maxWidth = '500px';

    const title = document.createElement('h3');
    title.textContent = 'Edit Node';
    title.style.margin = '0 0 15px 0';
    title.style.fontSize = '16px';
    title.style.fontWeight = 'bold';
    title.style.color = '#333';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentText;
    input.maxLength = LAYOUT_CONFIG.maxNodeTextLength;
    input.style.width = '100%';
    input.style.padding = '8px 12px';
    input.style.border = '2px solid #ddd';
    input.style.borderRadius = '4px';
    input.style.fontSize = '14px';
    input.style.marginBottom = '5px';
    input.style.boxSizing = 'border-box';
    input.style.outline = 'none';
    input.style.fontFamily = 'Helvetica, Arial, sans-serif';

    // Character counter
    const charCounter = document.createElement('div');
    charCounter.style.fontSize = '12px';
    charCounter.style.color = '#666';
    charCounter.style.textAlign = 'right';
    charCounter.style.marginBottom = '15px';
    const updateCharCounter = () => {
      const remaining = LAYOUT_CONFIG.maxNodeTextLength - input.value.length;
      charCounter.textContent = `${input.value.length}/${LAYOUT_CONFIG.maxNodeTextLength}`;
      if (remaining < 10) {
        charCounter.style.color = '#ff4444';
      } else if (remaining < 20) {
        charCounter.style.color = '#ff8800';
      } else {
        charCounter.style.color = '#666';
      }
    };
    updateCharCounter();

    input.addEventListener('focus', () => {
      input.style.borderColor = '#22AAE0';
    });

    input.addEventListener('blur', () => {
      input.style.borderColor = '#ddd';
    });

    input.addEventListener('input', updateCharCounter);

    input.addEventListener('keydown', (e) => {
      // Always stop propagation for dialog input to prevent global shortcuts
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.handleCancel();
      }
    });

    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '10px';

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.padding = '8px 16px';
    cancelButton.style.border = '2px solid #ddd';
    cancelButton.style.borderRadius = '4px';
    cancelButton.style.backgroundColor = 'white';
    cancelButton.style.color = '#666';
    cancelButton.style.cursor = 'pointer';
    cancelButton.style.fontSize = '14px';
    cancelButton.style.fontFamily = 'Helvetica, Arial, sans-serif';

    cancelButton.addEventListener('mouseover', () => {
      cancelButton.style.backgroundColor = '#f5f5f5';
    });

    cancelButton.addEventListener('mouseout', () => {
      cancelButton.style.backgroundColor = 'white';
    });

    cancelButton.addEventListener('click', () => {
      this.handleCancel();
    });

    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.style.padding = '8px 16px';
    saveButton.style.border = '2px solid #22AAE0';
    saveButton.style.borderRadius = '4px';
    saveButton.style.backgroundColor = '#22AAE0';
    saveButton.style.color = 'white';
    saveButton.style.cursor = 'pointer';
    saveButton.style.fontSize = '14px';
    saveButton.style.fontWeight = 'bold';
    saveButton.style.fontFamily = 'Helvetica, Arial, sans-serif';

    saveButton.addEventListener('mouseover', () => {
      saveButton.style.backgroundColor = '#1a8bb8';
      saveButton.style.borderColor = '#1a8bb8';
    });

    saveButton.addEventListener('mouseout', () => {
      saveButton.style.backgroundColor = '#22AAE0';
      saveButton.style.borderColor = '#22AAE0';
    });

    saveButton.addEventListener('click', () => {
      this.handleSave();
    });

    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(saveButton);

    this.dialog.appendChild(title);
    this.dialog.appendChild(input);
    this.dialog.appendChild(charCounter);
    this.dialog.appendChild(buttonContainer);
    
    this.overlay.appendChild(this.dialog);

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.handleCancel();
      }
    });
  }

  private handleSave(): void {
    if (this.dialog) {
      const input = this.dialog.querySelector('input') as HTMLInputElement;
      const text = input.value.trim();
      
      // Call the callback BEFORE closing (which clears the callback)
      if (this.onSave) {
        this.onSave(text);
      }
      
      // Close after calling the callback
      this.close();
    }
  }

  private handleCancel(): void {
    this.close();
    if (this.onCancel) {
      this.onCancel();
    }
  }

  private close(): void {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.dialog = null;
    this.overlay = null;
    this.onSave = undefined;
    this.onCancel = undefined;
  }
}